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

// Ensure upload dirs exist
const uploadDir = path.join(__dirname, 'uploads');
const stickersDir = path.join(__dirname, 'uploads', 'stickers');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(stickersDir)) fs.mkdirSync(stickersDir, { recursive: true });

// Multer setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (file.fieldname === 'sticker') cb(null, stickersDir);
        else cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, uniqueSuffix + ext);
    }
});
const upload = multer({ storage, limits: { fileSize: MAX_FILE_SIZE } });

// === AUTH MIDDLEWARE ===

const authenticate = (req, res, next) => {
    const auth = req.headers.authorization;
    const customAuth = req.headers['x-auth-token'];
    
    let tokenStr = null;
    if (auth && auth.startsWith('Bearer ')) tokenStr = auth.slice(7);
    else if (customAuth) tokenStr = customAuth;
    else if (req.query.token) tokenStr = req.query.token;
    
    if (!tokenStr) return res.status(401).json({ error: 'Unauthorized' });
    
    jwt.verify(tokenStr, JWT_SECRET, (err, decoded) => {
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

// === CONTACTS API ===

app.get('/api/users/:username/videos', (req, res) => {
    db.all(`SELECT v.*, u.username, 
            (SELECT COUNT(*) FROM video_likes WHERE video_id = v.id) as like_count
            FROM videos v 
            JOIN users u ON v.user_id = u.id 
            WHERE u.username = ?
            ORDER BY v.created_at DESC`, [req.params.username], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/users/:username', authenticate, (req, res) => {
    const { username } = req.params;
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err) {
            console.error('DATABASE ERROR (Profile):', err.message);
            return res.status(500).json({ error: err.message });
        }
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        // Remove sensitive info and return
        const { password, ...safeUser } = user;
        res.json(safeUser);
    });
});




app.get('/api/users', authenticate, requireAdmin, (req, res) => {
    db.all('SELECT * FROM users', [], (err, rows) => {
        if (err) {
            console.error('DATABASE ERROR (Admin List):', err.message);
            return res.status(500).json({ error: err.message });
        }
        // Remove sensitive info
        const safeRows = rows.map(u => {
            const { password, ...rest } = u;
            return rest;
        });
        res.json(safeRows);
    });
});


app.delete('/api/users/:id', authenticate, requireAdmin, (req, res) => {
    db.run('DELETE FROM users WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'User deleted' });
    });
});

app.get('/api/messages/all', authenticate, requireAdmin, (req, res) => {
    db.all(`SELECT m.*, u1.username as sender_username, 
            CASE WHEN m.chat_type = 'direct' THEN u2.username ELSE g.name END as receiver_username
            FROM messages m
            JOIN users u1 ON m.sender_id = u1.id
            LEFT JOIN users u2 ON (m.chat_type = 'direct' AND m.receiver_id = u2.id)
            LEFT JOIN groups g ON (m.chat_type = 'group' AND m.receiver_id = g.id)
            ORDER BY m.timestamp DESC LIMIT 100`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/admin/videos', authenticate, requireAdmin, (req, res) => {
    db.all(`SELECT v.*, u.username FROM videos v JOIN users u ON v.user_id = u.id ORDER BY v.created_at DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/admin/stats', authenticate, requireAdmin, (req, res) => {
    const stats = {};
    db.get('SELECT COUNT(*) as totalUsers FROM users', (err, row) => {
        stats.totalUsers = row.totalUsers;
        db.get('SELECT COUNT(*) as totalVideos, SUM(views) as totalViews FROM videos', (err, row) => {
            stats.totalVideos = row.totalVideos || 0;
            stats.totalViews = row.totalViews || 0;
            db.get('SELECT COUNT(*) as totalLikes FROM video_likes', (err, row) => {
                stats.totalLikes = row.totalLikes || 0;
                res.json(stats);
            });
        });
    });
});

// === SOCIAL NETWORK API ===

app.get('/api/feed', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const offset = (page - 1) * limit;

    db.get('SELECT COUNT(*) as count FROM videos', (err, row) => {
        const total = row.count;
        db.all(`SELECT v.*, u.username, 
                (SELECT COUNT(*) FROM video_likes WHERE video_id = v.id) as like_count
                FROM videos v 
                JOIN users u ON v.user_id = u.id 
                ORDER BY v.created_at DESC LIMIT ? OFFSET ?`, [limit, offset], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ 
                videos: rows,
                totalPages: Math.ceil(total / limit),
                currentPage: page
            });
        });
    });
});


app.post('/api/videos/upload', authenticate, upload.single('video'), (req, res) => {
    const { title, description } = req.body;
    if (!req.file || !title) return res.status(400).json({ error: 'Title and video file required' });
    
    db.run('INSERT INTO videos (user_id, filename, title, description) VALUES (?, ?, ?, ?)',
        [req.user.id, req.file.filename, title, description], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ id: this.lastID, filename: req.file.filename });
    });
});

app.get('/api/videos/:id', (req, res) => {
    db.get(`SELECT v.*, u.username, 
            (SELECT COUNT(*) FROM video_likes WHERE video_id = v.id) as like_count
            FROM videos v 
            JOIN users u ON v.user_id = u.id 
            WHERE v.id = ?`, [req.params.id], (err, video) => {
        if (err || !video) return res.status(404).json({ error: 'Video not found' });
        
        // Mark view
        db.run('UPDATE videos SET views = views + 1 WHERE id = ?', [req.params.id]);
        res.json(video);
    });
});

app.post('/api/videos/:id/like', authenticate, (req, res) => {
    db.run('INSERT INTO video_likes (user_id, video_id) VALUES (?, ?)',
        [req.user.id, req.params.id], function(err) {
        if (err) {
            // Un-like if already liked
            db.run('DELETE FROM video_likes WHERE user_id = ? AND video_id = ?', [req.user.id, req.params.id], () => {
                res.json({ liked: false });
            });
        } else {
            res.json({ liked: true });
        }
    });
});

app.get('/api/contacts', authenticate, (req, res) => {
    db.all(`SELECT u.id, u.username, u.avatar_url, c.status FROM contacts c
            JOIN users u ON (c.user_id = u.id OR c.contact_id = u.id)
            WHERE (c.user_id = ? OR c.contact_id = ?) AND u.id != ?`, 
            [req.user.id, req.user.id, req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});


app.post('/api/contacts/add', authenticate, (req, res) => {
    const { username } = req.body;
    db.get('SELECT id FROM users WHERE username = ?', [username], (err, target) => {
        if (err || !target) return res.status(404).json({ error: 'User not found' });
        if (target.id === req.user.id) return res.status(400).json({ error: 'Cannot add yourself' });
        
        db.run('INSERT INTO contacts (user_id, contact_id, status) VALUES (?, ?, ?)', 
            [req.user.id, target.id, 'pending'], function(err) {
            if (err) return res.status(400).json({ error: 'Request already exists' });
            res.status(201).json({ message: 'Contact request sent' });
        });
    });
});

app.post('/api/contacts/accept', authenticate, (req, res) => {
    const { contactId } = req.body;
    db.run('UPDATE contacts SET status = "accepted" WHERE user_id = ? AND contact_id = ?', 
        [contactId, req.user.id], function(err) {
        if (err || this.changes === 0) return res.status(404).json({ error: 'Request not found' });
        res.json({ message: 'Contact request accepted' });
    });
});

// === GROUPS API ===

app.post('/api/groups/create', authenticate, (req, res) => {
    const { name, memberIds } = req.body;
    db.run('INSERT INTO groups (name, created_by) VALUES (?, ?)', [name, req.user.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        const groupId = this.lastID;
        const members = [req.user.id, ...(memberIds || [])];
        const placeholders = members.map(() => '(?, ?)').join(',');
        const values = [];
        members.forEach(id => values.push(groupId, id));
        
        db.run(`INSERT INTO group_members (group_id, user_id) VALUES ${placeholders}`, values, (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ id: groupId, name });
        });
    });
});

app.post('/api/groups/:id/add-member', authenticate, (req, res) => {
    const { userId } = req.body;
    const groupId = req.params.id;
    // Check if user is in group or admin
    db.get('SELECT * FROM group_members WHERE group_id = ? AND user_id = ?', [groupId, req.user.id], (err, gm) => {
        if (!gm && req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
        db.run('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)', [groupId, userId], (err) => {
            if (err) return res.status(400).json({ error: 'Already a member' });
            res.json({ message: 'Member added' });
        });
    });
});

app.post('/api/user/avatar', authenticate, upload.single('avatar'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const url = `/api/media/${req.file.filename}`;
    db.run('UPDATE users SET avatar_url = ? WHERE id = ?', [url, req.user.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ url });
    });
});


app.get('/api/groups', authenticate, (req, res) => {
    db.all(`SELECT g.* FROM groups g JOIN group_members gm ON g.id = gm.group_id WHERE gm.user_id = ?`, 
        [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.delete('/api/groups/:id', authenticate, (req, res) => {
    const groupId = req.params.id;
    db.get('SELECT created_by FROM groups WHERE id = ?', [groupId], (err, group) => {
        if (err || !group) return res.status(404).json({ error: 'Group not found' });
        
        if (group.created_by !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized to delete this group' });
        }

        db.serialize(() => {
            db.run('DELETE FROM group_members WHERE group_id = ?', [groupId]);
            db.run('DELETE FROM messages WHERE receiver_id = ? AND chat_type = "group"', [groupId]);
            db.run('DELETE FROM groups WHERE id = ?', [groupId], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'Group deleted' });
            });
        });
    });
});


// === MEDIA PRIVACY & STREAMING ===

app.get('/api/media/:filename', (req, res) => {
    const { filename } = req.params;
    let filePath = path.join(uploadDir, filename);
    let isSticker = false;

    if (fs.existsSync(path.join(stickersDir, filename))) {
        filePath = path.join(stickersDir, filename);
        isSticker = true;
    } else if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found');
    }

    if (isSticker) {
        return serveFile(req, res, filePath, filename);
    }

    // Check if it's a public Feed video or an image
    const isImage = filename.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i);
    if (isImage) {
        return serveFile(req, res, filePath, filename); // Images (avatars/stickers) are public
    }

    db.get('SELECT id FROM videos WHERE filename = ?', [filename], (err, videoRow) => {
        if (videoRow) {
            return serveFile(req, res, filePath, filename); // Feed videos are public
        }

        // AUTH REQUIRED for non-public files (Private Messages)
        const auth = req.headers.authorization || (req.query.token ? `Bearer ${req.query.token}` : null);
        if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
        
        jwt.verify(auth.slice(7), JWT_SECRET, (err, decoded) => {
            if (err) return res.status(401).json({ error: 'Invalid token' });
            req.user = decoded;

                // Security check for private messages
                db.get('SELECT * FROM messages WHERE content LIKE ? AND (sender_id = ? OR receiver_id = ? OR (chat_type="group" AND receiver_id IN (SELECT group_id FROM group_members WHERE user_id = ?)))',
                    [`%${filename}%`, req.user.id, req.user.id, req.user.id], (err, msg) => {
                    
                    let hasAccess = !!msg || req.user.role === 'admin';

                    if (!hasAccess) {
                        res.status(403).json({ error: 'Access denied' });
                    } else {
                        serveFile(req, res, filePath, filename);
                    }
                });
            });
        });
    });
});

function serveFile(req, res, filePath, filename) {
    const stat = fs.statSync(filePath);
    const range = req.headers.range;
    const contentType = filename.endsWith('.mp4') ? 'video/mp4' : 
                      (filename.endsWith('.png') ? 'image/png' : 
                      (filename.endsWith('.jpg') || filename.endsWith('.jpeg') ? 'image/jpeg' : 
                      (filename.endsWith('.webp') ? 'image/webp' :
                      (filename.endsWith('.gif') ? 'image/gif' : 
                      (filename.endsWith('.svg') ? 'image/svg+xml' : 'audio/webm')))));

    if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': (end - start) + 1,
            'Content-Type': contentType,
        });
        fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
        res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
    }
}


// === MESSAGE API ===

app.get('/api/messages/:chatType/:id', authenticate, (req, res) => {
    const { chatType, id } = req.params;
    let query, params;
    
    const baseQuery = `SELECT m.*, u_del.username as deleted_by_username, u_sender.username as sender_username 
                       FROM messages m 
                       LEFT JOIN users u_del ON m.deleted_by = u_del.id 
                       LEFT JOIN users u_sender ON m.sender_id = u_sender.id
                       WHERE `;


    if (chatType === 'direct') {
        query = `${baseQuery} chat_type = 'direct' AND 
                 ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
                 ORDER BY timestamp ASC`;
        params = [req.user.id, id, id, req.user.id];
    } else {
        query = `${baseQuery} chat_type = 'group' AND receiver_id = ?
                 ORDER BY timestamp ASC`;
        params = [id];
    }

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});


app.post('/api/upload', authenticate, upload.single('media'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ url: `/api/media/${req.file.filename}` });
});

// === STICKERS API ===

app.post('/api/stickers/upload', authenticate, upload.single('sticker'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No sticker uploaded' });
    const url = `/api/media/${req.file.filename}`;
    db.run('INSERT INTO stickers (url, creator_id) VALUES (?, ?)', [url, req.user.id], function(err) {
        if (err) {
            // Un error como SQLITE_ERROR ignorarlo fallaría. Tratemos de ver si tiene columna de url
            // Si esto falla es que la tabla es distinta.
            db.run('INSERT INTO stickers (filename, creator_id) VALUES (?, ?)', [req.file.filename, req.user.id], function(fallbackErr) {
               if (fallbackErr) return res.status(500).json({ error: fallbackErr.message });
               res.status(201).json({ id: this.lastID, url });
            });
            return;
        }
        res.status(201).json({ id: this.lastID, url });
    });
});

app.get('/api/stickers', authenticate, (req, res) => {
    fs.readdir(stickersDir, (err, files) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const existingFiles = new Set(files);
        const folderStickers = files
            .filter(f => f.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i))
            .map((f, i) => ({
                id: `local_${i}_${f}`,
                url: `/api/media/${f}`,
                name: f
            }));
            
        db.all('SELECT * FROM stickers', [], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            
            const dbStickers = rows.map(s => ({ ...s, url: s.url || `/api/media/${s.filename}` }))
                .filter(s => {
                    const match = s.url.match(/^\/api\/media\/(.+)$/);
                    if (match) return existingFiles.has(match[1]);
                    return true;
                });
                
            const urlSet = new Set(dbStickers.map(s => s.url));
            const finalStickers = [...dbStickers, ...folderStickers.filter(s => !urlSet.has(s.url))];
            
            res.json(finalStickers);
        });
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
    
    // Join logic: each user joins their own ID room for private messages
    socket.join(`user_${socket.user.id}`);

    // Join group rooms
    db.all('SELECT group_id FROM group_members WHERE user_id = ?', [socket.user.id], (err, rows) => {
        if (!err) rows.forEach(r => socket.join(`group_${r.group_id}`));
    });

    socket.on('send_message', (data) => {
        const { receiverId, content, type, chatType } = data;
        db.run('INSERT INTO messages (sender_id, receiver_id, content, type, chat_type) VALUES (?, ?, ?, ?, ?)',
            [socket.user.id, receiverId, content, type, chatType], function(err) {
            if (err) {
                console.error('DATABASE ERROR (send_message):', err.message);
                return;
            }
            const messageId = this.lastID;
            const message = { 
                id: messageId, 
                sender_id: socket.user.id, 
                sender_username: socket.user.username,
                receiver_id: receiverId, 
                content, 
                type, 
                chat_type: chatType, 
                timestamp: new Date().toISOString() 
            };
            
            if (chatType === 'direct') {
                if (receiverId !== socket.user.id) {
                    io.to(`user_${receiverId}`).emit('receive_message', message);
                }
                io.to(`user_${socket.user.id}`).emit('receive_message', message);
            } else {
                io.to(`group_${receiverId}`).emit('receive_message', message);
            }
        });
    });

    socket.on('delete_message', (messageId) => {
        db.get('SELECT * FROM messages WHERE id = ?', [messageId], (err, msg) => {
            if (msg && (msg.sender_id === socket.user.id || socket.user.role === 'admin')) {
                db.run('UPDATE messages SET is_deleted = 1, deleted_by = ? WHERE id = ?', [socket.user.id, messageId], () => {
                    const target = msg.chat_type === 'direct' ? `user_${msg.receiver_id}` : `group_${msg.receiver_id}`;
                    
                    // Fetch deleter username
                    db.get('SELECT username FROM users WHERE id = ?', [socket.user.id], (err, deleter) => {
                        const payload = { messageId, deletedBy: deleter?.username || 'Sistema' };
                        io.to(target).emit('message_deleted', payload);
                        socket.emit('message_deleted', payload);
                        if (msg.chat_type === 'direct') io.to(`user_${msg.sender_id}`).emit('message_deleted', payload);
                    });
                });
            }
        });
    });


    socket.on('disconnect', () => {
        onlineUsers.delete(socket.user.id);
    });
});

server.listen(PORT, () => console.log(`Backend running on port ${PORT}`));

