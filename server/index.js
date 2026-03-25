const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key';
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure upload dir exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Multer setup for large video uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, uniqueSuffix + ext);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Only video files are allowed'), false);
        }
    }
});

// === AUTH MIDDLEWARE ===

const authenticate = (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    jwt.verify(auth.slice(7), JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ error: 'Invalid token' });
        req.user = decoded;
        next();
    });
};

const requireAdmin = (req, res, next) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    next();
};

// === AUTH API ===

app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Username already exists' });
                return res.status(500).json({ error: err.message });
            }
            res.status(201).json({ message: 'User created successfully', userId: this.lastID });
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(400).json({ error: 'Invalid username or password' });
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: 'Invalid username or password' });
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
    });
});

app.get('/api/users', (req, res) => {
    db.all('SELECT id, username, role FROM users', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.delete('/api/users/:id', authenticate, requireAdmin, (req, res) => {
    const { id } = req.params;
    if (parseInt(id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
    db.run('DELETE FROM users WHERE id = ? AND role != ?', [id, 'admin'], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'User not found or is admin' });
        res.json({ message: 'User deleted' });
    });
});

// === VIDEO FEED API ===

// Get paginated feed (all videos, newest first)
app.get('/api/feed', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const offset = (page - 1) * limit;

    db.get('SELECT COUNT(*) as total FROM videos', [], (err, countRow) => {
        if (err) return res.status(500).json({ error: err.message });

        db.all(`SELECT v.*, u.username,
                (SELECT COUNT(*) FROM likes WHERE video_id = v.id) as like_count
                FROM videos v
                JOIN users u ON v.user_id = u.id
                ORDER BY v.created_at DESC
                LIMIT ? OFFSET ?`, [limit, offset], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({
                videos: rows,
                total: countRow.total,
                page,
                totalPages: Math.ceil(countRow.total / limit)
            });
        });
    });
});

// Get single video metadata
app.get('/api/videos/:id', (req, res) => {
    const { id } = req.params;
    db.get(`SELECT v.*, u.username,
            (SELECT COUNT(*) FROM likes WHERE video_id = v.id) as like_count
            FROM videos v
            JOIN users u ON v.user_id = u.id
            WHERE v.id = ?`, [id], (err, video) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!video) return res.status(404).json({ error: 'Video not found' });

        // Increment view count
        db.run('UPDATE videos SET views = views + 1 WHERE id = ?', [id]);
        res.json(video);
    });
});

// Upload a video (authenticated)
app.post('/api/videos/upload', authenticate, upload.single('video'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No video file uploaded' });
    const { title, description } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });

    db.run(`INSERT INTO videos (user_id, title, description, filename, original_name, mimetype, size)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [req.user.id, title.trim(), description?.trim() || '', req.file.filename, req.file.originalname, req.file.mimetype, req.file.size],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ id: this.lastID, message: 'Video uploaded successfully' });
        });
});

// Delete a video (owner or admin)
app.delete('/api/videos/:id', authenticate, (req, res) => {
    const { id } = req.params;
    db.get('SELECT * FROM videos WHERE id = ?', [id], (err, video) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!video) return res.status(404).json({ error: 'Video not found' });
        if (video.user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Not authorized' });
        }
        // Delete file from disk
        const filePath = path.join(uploadDir, video.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        db.run('DELETE FROM videos WHERE id = ?', [id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Video deleted' });
        });
    });
});

// Toggle like on a video
app.post('/api/videos/:id/like', authenticate, (req, res) => {
    const videoId = req.params.id;
    const userId = req.user.id;

    db.get('SELECT * FROM likes WHERE user_id = ? AND video_id = ?', [userId, videoId], (err, like) => {
        if (err) return res.status(500).json({ error: err.message });
        if (like) {
            db.run('DELETE FROM likes WHERE user_id = ? AND video_id = ?', [userId, videoId], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ liked: false });
            });
        } else {
            db.run('INSERT INTO likes (user_id, video_id) VALUES (?, ?)', [userId, videoId], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ liked: true });
            });
        }
    });
});

// Check if user liked a video
app.get('/api/videos/:id/liked', authenticate, (req, res) => {
    db.get('SELECT * FROM likes WHERE user_id = ? AND video_id = ?', [req.user.id, req.params.id], (err, like) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ liked: !!like });
    });
});

// Get videos by a specific user
app.get('/api/users/:username/videos', (req, res) => {
    const { username } = req.params;
    db.all(`SELECT v.*, u.username,
            (SELECT COUNT(*) FROM likes WHERE video_id = v.id) as like_count
            FROM videos v
            JOIN users u ON v.user_id = u.id
            WHERE u.username = ?
            ORDER BY v.created_at DESC`, [username], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// === VIDEO STREAMING (HTTP Range Requests) ===

app.get('/api/stream/:filename', (req, res) => {
    const filePath = path.join(uploadDir, req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).send('File not found');

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = (end - start) + 1;

        const file = fs.createReadStream(filePath, { start, end });
        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': 'video/mp4',
        });
        file.pipe(res);
    } else {
        res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type': 'video/mp4',
        });
        fs.createReadStream(filePath).pipe(res);
    }
});

// === ADMIN API ===

app.get('/api/admin/stats', authenticate, requireAdmin, (req, res) => {
    const stats = {};
    db.get('SELECT COUNT(*) as count FROM users', [], (err, row) => {
        stats.totalUsers = row?.count || 0;
        db.get('SELECT COUNT(*) as count FROM videos', [], (err, row) => {
            stats.totalVideos = row?.count || 0;
            db.get('SELECT COUNT(*) as count FROM likes', [], (err, row) => {
                stats.totalLikes = row?.count || 0;
                db.get('SELECT COALESCE(SUM(views), 0) as count FROM videos', [], (err, row) => {
                    stats.totalViews = row?.count || 0;
                    res.json(stats);
                });
            });
        });
    });
});

app.get('/api/admin/videos', authenticate, requireAdmin, (req, res) => {
    db.all(`SELECT v.*, u.username,
            (SELECT COUNT(*) FROM likes WHERE video_id = v.id) as like_count
            FROM videos v
            JOIN users u ON v.user_id = u.id
            ORDER BY v.created_at DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Get available users for chat
app.get('/api/chat/users', authenticate, (req, res) => {
    db.all('SELECT id, username FROM users WHERE id != ?', [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Get chat history with a specific user
app.get('/api/messages/:userId', authenticate, (req, res) => {
    const { userId } = req.params;
    db.all(`SELECT * FROM messages 
            WHERE (sender_id = ? AND receiver_id = ?) 
               OR (sender_id = ? AND receiver_id = ?) 
            ORDER BY timestamp ASC`, 
        [req.user.id, userId, userId, req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Admin: Get all messages for monitor
app.get('/api/messages/all', authenticate, requireAdmin, (req, res) => {
    db.all(`SELECT m.*, 
            s.username as sender_username, 
            r.username as receiver_username 
            FROM messages m
            JOIN users s ON m.sender_id = s.id
            JOIN users r ON m.receiver_id = r.id
            ORDER BY m.timestamp DESC LIMIT 100`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// === SOCKET.IO ===

const onlineUsers = new Map();

io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error'));
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return next(new Error('Authentication error'));
        socket.user = decoded;
        next();
    });
});

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.username}`);
    onlineUsers.set(socket.user.id, socket.id);
    io.emit('user_status', Array.from(onlineUsers.keys()));

    socket.on('send_message', (data) => {
        const { receiverId, content, type } = data;
        
        db.run('INSERT INTO messages (sender_id, receiver_id, content, type) VALUES (?, ?, ?, ?)',
            [socket.user.id, receiverId, content, type || 'text'],
            function(err) {
                if (err) return console.error(err.message);
                
                const message = {
                    id: this.lastID,
                    sender_id: socket.user.id,
                    receiver_id: receiverId,
                    content,
                    type: type || 'text',
                    timestamp: new Date().toISOString()
                };

                // Send to receiver if online
                const receiverSocketId = onlineUsers.get(receiverId);
                if (receiverSocketId) {
                    io.to(receiverSocketId).emit('receive_message', message);
                }
                
                // Send back to sender for confirmation
                socket.emit('receive_message', message);
            });
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.user.username}`);
        onlineUsers.delete(socket.user.id);
        io.emit('user_status', Array.from(onlineUsers.keys()));
    });
});

server.listen(PORT, () => {
    console.log(`jo no xerro server running on port ${PORT}`);
});
