const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./chat.db');

// Check where these files appear
const files = ['1775676509380-929984006.gif', '1775677607155-938321710.jpeg'];

files.forEach(f => {
    db.all(`SELECT * FROM messages WHERE content LIKE ?`, [`%${f}%`], (err, rows) => {
        console.log(`\nMessages with ${f}:`, rows?.length || 0);
        if (rows?.length) console.log(JSON.stringify(rows, null, 2));
    });
    db.all(`SELECT id, username, avatar_url FROM users WHERE avatar_url LIKE ?`, [`%${f}%`], (err, rows) => {
        console.log(`\nUsers with avatar ${f}:`, rows?.length || 0);
        if (rows?.length) console.log(JSON.stringify(rows, null, 2));
    });
});

// Also check all messages with media
db.all(`SELECT id, sender_id, content, type FROM messages WHERE type != 'text' ORDER BY id DESC LIMIT 20`, [], (err, rows) => {
    console.log(`\nRecent non-text messages:`);
    console.log(JSON.stringify(rows, null, 2));
    db.close();
});
