const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const dbPath = path.resolve(__dirname, 'chat.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');

        // Enable WAL mode for better concurrent performance
        db.run('PRAGMA journal_mode=WAL');

        // Users table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            role TEXT DEFAULT 'user',
            avatar_url TEXT DEFAULT NULL,
            avatar_color TEXT DEFAULT '#6366f1',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => { if (err) console.error(err.message); });

        // Comprehensive migrations for users table
        db.run('ALTER TABLE users ADD COLUMN role TEXT DEFAULT "user"', (err) => {});
        db.run('ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT NULL', (err) => {});
        db.run('ALTER TABLE users ADD COLUMN avatar_color TEXT DEFAULT "#6366f1"', (err) => {});
        db.run('ALTER TABLE users ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP', (err) => {});



        // Contacts table
        db.run(`CREATE TABLE IF NOT EXISTS contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            contact_id INTEGER NOT NULL,
            status TEXT DEFAULT 'pending', -- 'pending', 'accepted'
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, contact_id),
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (contact_id) REFERENCES users(id)
        )`, (err) => { if (err) console.error(err.message); });

        // Groups table
        db.run(`CREATE TABLE IF NOT EXISTS groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            created_by INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES users(id)
        )`, (err) => { if (err) console.error(err.message); });

        // Group Members table
        db.run(`CREATE TABLE IF NOT EXISTS group_members (
            group_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (group_id, user_id),
            FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`, (err) => { if (err) console.error(err.message); });

        // Stickers table
        db.run(`CREATE TABLE IF NOT EXISTS stickers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            url TEXT NOT NULL,
            creator_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (creator_id) REFERENCES users(id)
        )`, (err) => { if (err) console.error(err.message); });


        // Enhanced Messages table
        db.run(`CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id INTEGER NOT NULL,
            receiver_id INTEGER NOT NULL, -- user_id or group_id
            chat_type TEXT DEFAULT 'direct', -- 'direct' or 'group'
            content TEXT,
            type TEXT DEFAULT 'text', -- 'text', 'video', 'audio', 'sticker'
            is_deleted INTEGER DEFAULT 0,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (sender_id) REFERENCES users(id)
        )`, (err) => { if (err) console.error(err.message); });

        const addColumns = [
            'ALTER TABLE messages ADD COLUMN chat_type TEXT DEFAULT "direct"',
            'ALTER TABLE messages ADD COLUMN is_deleted INTEGER DEFAULT 0',
            'ALTER TABLE messages ADD COLUMN deleted_by INTEGER'
        ];

        addColumns.forEach(sql => {
            db.run(sql, (err) => {
                // Ignore "duplicate column name" errors
            });
        });

        // Social Network Tables
        db.run(`CREATE TABLE IF NOT EXISTS videos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            filename TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            views INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`, (err) => { if (err) console.error(err.message); });

        db.run(`CREATE TABLE IF NOT EXISTS video_likes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            video_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, video_id),
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
        )`, (err) => { if (err) console.error(err.message); });

        // Initialize default admin
        const adminPassword = bcrypt.hashSync('admin123', 10);
        db.get('SELECT id FROM users WHERE username = ?', ['admin'], (err, row) => {
            if (!row) {
                db.run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', ['admin', adminPassword, 'admin']);
            }
        });

    }
});

module.exports = db;
