const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, 'chat.db'));

const stickers = [
  { name: 'Happy', filename: 'happy.png' },
  { name: 'Cool', filename: 'cool.png' },
  { name: 'Love', filename: 'love.png' }
];

db.serialize(() => {
  const stmt = db.prepare("INSERT INTO stickers (name, url) VALUES (?, ?)");
  stickers.forEach(s => {
    stmt.run(s.name, `/api/media/${s.filename}`);
  });
  stmt.finalize();
  console.log("Stickers seeded successfully");
});

db.close();
