const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_FILE = path.join(__dirname, 'database.sqlite');

const dir = path.dirname(DB_FILE);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) {
    console.error('Failed to open SQLite database:', err);
    process.exit(1);
  }
});

db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON;');

  db.run(
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,
    (err) => {
      if (err) console.error('Failed to create users table:', err);
    }
  );
});

// Ensure `is_admin` column exists for older databases
db.serialize(() => {
  db.all("PRAGMA table_info(users)", (err, rows) => {
    if (err) return console.error('Failed to read users table info:', err);
    const hasIsAdmin = rows && rows.some(r => r.name === 'is_admin');
    if (!hasIsAdmin) {
      db.run(`ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0`, (alterErr) => {
        if (alterErr) console.error('Failed to add is_admin column:', alterErr);
        else console.log('Added is_admin column to users table');
      });
    }
  });
});

// Promise-based helpers (you can also use callbacks if you prefer)
function createUser(username, password) {
  return new Promise((resolve, reject) => {
    const sql = 'INSERT INTO users (username, password) VALUES (?, ?)';
    db.run(sql, [username, password], function (err) {
      if (err) return reject(err);
      resolve(this.lastID);
    });
  });
}

function findByUsername(username) {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT * FROM users WHERE username = ?';
    db.get(sql, [username], (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function setAdmin(id, isAdmin = 1) {
  return new Promise((resolve, reject) => {
    const sql = 'UPDATE users SET is_admin = ? WHERE id = ?';
    db.run(sql, [isAdmin ? 1 : 0, id], function (err) {
      if (err) return reject(err);
      resolve(this.changes);
    });
  });
}

function findById(id) {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT * FROM users WHERE id = ?';
    db.get(sql, [id], (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function close() {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

module.exports = {
  db,
  createUser,
  findByUsername,
  findById,
  setAdmin,
  close,
};