const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./chat.db');

db.all('SELECT * FROM stickers', [], (err, rows) => {
    console.log("STICKERS TABLE:");
    console.log(rows);
    db.all('SELECT * FROM messages WHERE type="sticker" ORDER BY id DESC LIMIT 5', [], (err, mRows) => {
        console.log("MESSAGES TABLE:");
        console.log(mRows);
        db.close();
    });
});
