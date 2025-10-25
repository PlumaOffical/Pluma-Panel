const { db } = require('./init');

function ensureTables() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(
        `CREATE TABLE IF NOT EXISTS plans (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          egg TEXT,
          nest TEXT,
          ram INTEGER,
          disk INTEGER,
          cpu INTEGER,
          billing_cycle TEXT DEFAULT 'monthly',
          price REAL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );`,
        (e) => { if (e) return reject(e); }
      );

      db.run(
        `CREATE TABLE IF NOT EXISTS orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          plan_id INTEGER,
          server_name TEXT,
          price REAL,
          status TEXT DEFAULT 'pending',
          ptero_server_id TEXT NULL,
          ptero_response TEXT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );`,
        (e) => { if (e) return reject(e); resolve(); }
      );
    });
  });
}

// ensure orders table has the additional columns (for older DBs)
function ensureOrderColumns() {
  return new Promise((resolve, reject) => {
    db.all("PRAGMA table_info(orders);", (err, cols) => {
      if (err) return reject(err);
      const names = (cols || []).map(c => c.name);
      const adds = [];
      if (!names.includes('ptero_server_id')) adds.push("ALTER TABLE orders ADD COLUMN ptero_server_id TEXT NULL;");
      if (!names.includes('ptero_response')) adds.push("ALTER TABLE orders ADD COLUMN ptero_response TEXT NULL;");

      (function runNext(i) {
        if (i >= adds.length) return resolve();
        db.run(adds[i], (e) => {
          if (e) {
            if (e.code === 'SQLITE_ERROR' && /duplicate column name/i.test(e.message)) return runNext(i+1);
            return reject(e);
          }
          runNext(i+1);
        });
      })(0);
    });
  });
}

function createPlan(plan) {
  return ensureTables().then(() => new Promise((resolve, reject) => {
    const sql = `INSERT INTO plans (name, egg, nest, ram, disk, cpu, billing_cycle, price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql, [plan.name, plan.egg || '', plan.nest || '', plan.ram || 0, plan.disk || 0, plan.cpu || 0, plan.billing_cycle || 'monthly', plan.price || 0], function (err) {
      if (err) return reject(err);
      resolve(this.lastID);
    });
  }));
}

function getPlans() {
  return ensureTables().then(() => new Promise((resolve, reject) => {
    db.all('SELECT * FROM plans ORDER BY id ASC', [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  }));
}

function getPlanById(id) {
  return ensureTables().then(() => new Promise((resolve, reject) => {
    db.get('SELECT * FROM plans WHERE id = ?', [id], (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  }));
}

function deletePlan(id) {
  return ensureTables().then(() => new Promise((resolve, reject) => {
    db.run('DELETE FROM plans WHERE id = ?', [id], function (err) {
      if (err) return reject(err);
      resolve(this.changes);
    });
  }));
}

function createOrder(userId, planId, serverName, price) {
  return ensureTables().then(() => new Promise((resolve, reject) => {
    const sql = `INSERT INTO orders (user_id, plan_id, server_name, price, status) VALUES (?, ?, ?, ?, 'pending')`;
    db.run(sql, [userId, planId, serverName, price], function (err) {
      if (err) return reject(err);
      resolve(this.lastID);
    });
  }));
}

function getOrdersByUser(userId) {
  return ensureTables().then(() => ensureOrderColumns()).then(() => new Promise((resolve, reject) => {
    db.all('SELECT o.*, p.name AS plan_name FROM orders o LEFT JOIN plans p ON p.id = o.plan_id WHERE o.user_id = ? ORDER BY o.created_at DESC', [userId], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  }));
}

function getOrderById(id) {
  return ensureTables().then(() => ensureOrderColumns()).then(() => new Promise((resolve, reject) => {
    db.get('SELECT o.*, p.name AS plan_name FROM orders o LEFT JOIN plans p ON p.id = o.plan_id WHERE o.id = ?', [id], (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  }));
}

function getAllOrders() {
  return ensureTables().then(() => ensureOrderColumns()).then(() => new Promise((resolve, reject) => {
    const sql = `SELECT o.*, p.name AS plan_name, u.username AS username FROM orders o
                 LEFT JOIN plans p ON p.id = o.plan_id
                 LEFT JOIN users u ON u.id = o.user_id
                 ORDER BY o.created_at DESC`;
    db.all(sql, [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  }));
}

function updateOrderStatus(id, status) {
  return ensureTables().then(() => ensureOrderColumns()).then(() => new Promise((resolve, reject) => {
    db.run('UPDATE orders SET status = ? WHERE id = ?', [status, id], function (err) {
      if (err) return reject(err);
      resolve(this.changes);
    });
  }));
}

function deleteOrder(id) {
  return ensureTables().then(() => ensureOrderColumns()).then(() => new Promise((resolve, reject) => {
    db.run('DELETE FROM orders WHERE id = ?', [id], function (err) {
      if (err) return reject(err);
      resolve(this.changes);
    });
  }));
}

function markOrderProvisionResult(orderId, serverId, responseObj, status) {
  return ensureTables().then(() => ensureOrderColumns()).then(() => new Promise((resolve, reject) => {
    try {
      const respText = responseObj ? JSON.stringify(responseObj) : null;
      db.run('UPDATE orders SET ptero_server_id = ?, ptero_response = ?, status = ? WHERE id = ?', [serverId || null, respText, status || 'pending', orderId], function (err) {
        if (err) return reject(err);
        resolve(this.changes);
      });
    } catch (e) { reject(e); }
  }));
}

module.exports = {
  createPlan,
  getPlans,
  getPlanById,
  deletePlan,
  createOrder,
  getOrdersByUser,
  getOrderById,
  getAllOrders,
  updateOrderStatus,
  deleteOrder,
  markOrderProvisionResult,
};
