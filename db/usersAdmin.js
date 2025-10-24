const { db } = require('./init');

function ensureColumns() {
  return new Promise((resolve, reject) => {
    db.all("PRAGMA table_info(users);", (err, cols) => {
      if (err) return reject(err);
      const names = (cols || []).map(c => c.name);
      const adds = [];

      if (!names.includes('deleted_at')) adds.push("ALTER TABLE users ADD COLUMN deleted_at DATETIME NULL;");
      if (!names.includes('balance')) adds.push("ALTER TABLE users ADD COLUMN balance REAL DEFAULT 0;");
      if (!names.includes('is_admin')) adds.push("ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0;");

      // run ALTER statements sequentially and ignore duplicate-column errors
      (function runNext(i) {
        if (i >= adds.length) {
          // ensure archive table exists
          return db.run(
            `CREATE TABLE IF NOT EXISTS deleted_users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              original_id INTEGER,
              username TEXT,
              password TEXT,
              created_at DATETIME,
              balance REAL DEFAULT 0,
              is_admin INTEGER DEFAULT 0,
              deleted_at DATETIME,
              deleted_by INTEGER
            );`,
            (e) => e ? reject(e) : resolve()
          );
        }
        db.run(adds[i], (e) => {
          if (e) {
            if (e.code === 'SQLITE_ERROR' && /duplicate column name/i.test(e.message)) {
              return runNext(i + 1);
            }
            return reject(e);
          }
          runNext(i + 1);
        });
      })(0);
    });
  });
}

async function getUsers(page = 1, limit = 15) {
  await ensureColumns();
  const offset = (page - 1) * limit;
  return new Promise((resolve, reject) => {
    const sql = `SELECT id, username, created_at, deleted_at, balance, is_admin
                 FROM users
                 ORDER BY id ASC
                 LIMIT ? OFFSET ?`;
    db.all(sql, [limit, offset], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

async function countUsers() {
  await ensureColumns();
  return new Promise((resolve, reject) => {
    db.get("SELECT COUNT(*) AS c FROM users;", [], (err, row) => {
      if (err) return reject(err);
      resolve(row ? row.c : 0);
    });
  });
}

async function getUserById(id) {
  await ensureColumns();
  return new Promise((resolve, reject) => {
    db.get("SELECT id, username, created_at, deleted_at, balance, is_admin FROM users WHERE id = ?", [id], (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

async function setAdminFlag(id, flag) {
  await ensureColumns();
  return new Promise((resolve, reject) => {
    db.run("UPDATE users SET is_admin = ? WHERE id = ?", [flag ? 1 : 0, id], function (err) {
      if (err) return reject(err);
      resolve(this.changes);
    });
  });
}

async function adjustBalance(id, delta) {
  await ensureColumns();
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run("UPDATE users SET balance = COALESCE(balance,0) + ? WHERE id = ?", [delta, id], function (err) {
        if (err) return reject(err);
        db.get("SELECT balance FROM users WHERE id = ?", [id], (e, row) => {
          if (e) return reject(e);
          // return numeric balance or null if user not found
          resolve(row ? (row.balance || 0) : null);
        });
      });
    });
  });
}

// archive the user into deleted_users then permanently delete from users
async function archiveAndDeleteUser(id, deletedBy = null) {
  await ensureColumns();
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.get("SELECT * FROM users WHERE id = ?", [id], (err, user) => {
        if (err) return reject(err);
        if (!user) return resolve(0);
        if (user.is_admin) return reject(new Error('Cannot delete an admin account'));

        const insertSql = `INSERT INTO deleted_users
          (original_id, username, password, created_at, balance, is_admin, deleted_at, deleted_by)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)`;

        db.run(insertSql, [
          user.id,
          user.username,
          user.password,
          user.created_at,
          user.balance || 0,
          user.is_admin || 0,
          deletedBy
        ], function (insErr) {
          if (insErr) return reject(insErr);

          db.run("DELETE FROM users WHERE id = ?", [id], function (delErr) {
            if (delErr) return reject(delErr);
            resolve(this.changes);
          });
        });
      });
    });
  });
}

// exported hardDeleteUser kept for compatibility (alias to archiveAndDeleteUser)
async function hardDeleteUser(id) {
  return archiveAndDeleteUser(id, null);
}

// fetch archived users from deleted_users
async function getArchivedUsers() {
  await ensureColumns();
  return new Promise((resolve, reject) => {
    const sql = `SELECT original_id, username, created_at, balance, is_admin, deleted_at, deleted_by
                 FROM deleted_users
                 ORDER BY deleted_at DESC`;
    db.all(sql, [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

module.exports = {
  getUsers,
  countUsers,
  getUserById,
  adjustBalance,
  setAdminFlag,
  archiveAndDeleteUser,
  hardDeleteUser,
  getArchivedUsers,
};