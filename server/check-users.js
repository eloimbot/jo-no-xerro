const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./chat.db');

db.all('SELECT id, username, avatar_url FROM users', [], (err, rows) => {
    if (err) {
        console.error(err);
    } else {
        console.log("USERS TABLE:");
        console.log(JSON.stringify(rows, null, 2));
    }
    db.close();
});
