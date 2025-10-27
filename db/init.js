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
      email TEXT UNIQUE,
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

// ensure `email` column exists for older databases
db.serialize(() => {
  db.all("PRAGMA table_info(users)", (err, rows) => {
    if (err) return console.error('Failed to read users table info for email check:', err);
    const hasEmail = rows && rows.some(r => r.name === 'email');
    if (!hasEmail) {
      db.run(`ALTER TABLE users ADD COLUMN email TEXT;`, (alterErr) => {
        if (alterErr) {
          // ignore duplicate column race condition
          if (!(alterErr.code === 'SQLITE_ERROR' && /duplicate column name/i.test(alterErr.message))) {
            console.error('Failed to add email column:', alterErr);
          }
        } else console.log('Added email column to users table');
      });
    }
  });
});

// ensure pterodactyl mapping columns exist
db.serialize(() => {
  db.all("PRAGMA table_info(users)", (err, rows) => {
    if (err) return console.error('Failed to read users table info for ptero check:', err);
    const names = (rows || []).map(r => r.name);
    if (!names.includes('ptero_user_id')) {
      db.run(`ALTER TABLE users ADD COLUMN ptero_user_id TEXT NULL;`, (e) => {
        if (e && !(e.code === 'SQLITE_ERROR' && /duplicate column name/i.test(e.message))) console.error('Failed to add ptero_user_id column', e);
      });
    }
    if (!names.includes('ptero_user_password')) {
      db.run(`ALTER TABLE users ADD COLUMN ptero_user_password TEXT NULL;`, (e) => {
        if (e && !(e.code === 'SQLITE_ERROR' && /duplicate column name/i.test(e.message))) console.error('Failed to add ptero_user_password column', e);
      });
    }
  });
});

// Promise-based helpers (you can also use callbacks if you prefer)
function createUser(username, password, email) {
  return new Promise((resolve, reject) => {
    const sql = 'INSERT INTO users (username, password, email) VALUES (?, ?, ?)';
    db.run(sql, [username, password, email || null], function (err) {
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

function findByEmail(email) {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT * FROM users WHERE email = ?';
    db.get(sql, [email], (err, row) => {
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

function setPteroInfo(userId, pteroId, password) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE users SET ptero_user_id = ?, ptero_user_password = ? WHERE id = ?', [pteroId || null, password || null, userId], function (err) {
      if (err) return reject(err);
      resolve(this.changes);
    });
  });
}

function updateUsername(userId, newUsername) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE users SET username = ? WHERE id = ?', [newUsername, userId], function (err) {
      if (err) return reject(err);
      resolve(this.changes);
    });
  });
}

function updatePassword(userId, newPassword) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE users SET password = ? WHERE id = ?', [newPassword, userId], function (err) {
      if (err) return reject(err);
      resolve(this.changes);
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
  findByEmail,
  findById,
  setPteroInfo,
  setAdmin,
  updateUsername,
  updatePassword,
  close,
};