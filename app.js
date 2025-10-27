const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const expressLayouts = require('express-ejs-layouts');
const path = require('path');

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const adminRoutes = require('./routes/admin');
const adminUsersRoutes = require('./routes/adminUsers');
const adminPteroRoutes = require('./routes/adminPterodactyl');
const adminSettingsRoutes = require('./routes/adminSettings');
const adminPlansRoutes = require('./routes/adminPlans');
const storeRoutes = require('./routes/store');
const servicesRoutes = require('./routes/services');
const adminServicesRoutes = require('./routes/adminServices');
const profileRoutes = require('./routes/profile');
require('./db/init'); // ensures DB and table exist

const app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// session (persistent across restarts)
app.use(
  session({
    store: new SQLiteStore({
      db: 'sessions.sqlite',
      dir: path.join(__dirname, 'db'),
      table: 'sessions',
      concurrentDB: true,
      // cleanupInterval: 60 * 60 // optional: run cleanup every hour (seconds)
    }),
    secret: process.env.SESSION_SECRET || 'please_change_this_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // set true in prod with HTTPS
      sameSite: 'lax',
    },
  })
);

app.use(expressLayouts);
app.set('layout', 'components/layout');

app.use((req, res, next) => {
  res.locals.user = req.session ? req.session.user : null;
  res.locals.currentPath = req.originalUrl || req.path;
  res.locals.isAdminRoute = String(res.locals.currentPath).startsWith('/admin');
  next();
});

// expose web config (from config/config.json) to all views as `web`
const fs = require('fs');
const CONFIG_PATH = path.join(__dirname, 'config', 'config.json');
app.use((req, res, next) => {
  try {
    const txt = fs.readFileSync(CONFIG_PATH, 'utf8');
    const cfg = JSON.parse(txt);
    res.locals.web = cfg.web || {};
  } catch (e) {
    res.locals.web = { name: 'Pluma Panel' };
  }
  next();
});

app.use('/', dashboardRoutes);
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/admin/users', adminUsersRoutes);
app.use('/admin/pterodactyl', adminPteroRoutes);
app.use('/admin/settings', adminSettingsRoutes);
app.use('/admin/plans', adminPlansRoutes);
app.use('/admin/services', adminServicesRoutes);
app.use('/store', storeRoutes);
app.use('/services', servicesRoutes);
app.use('/profile', profileRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

// background job: periodically check for expired orders and suspend their servers
const PlansDB = require('./db/plans');
const http = require('http');
const https = require('https');

async function checkExpiredOrders() {
  try {
    const all = await PlansDB.getAllOrders();
    const now = new Date();
    const expired = (all || []).filter(o => o && o.expires_at && (new Date(o.expires_at) <= now) && String(o.status).toLowerCase() === 'active');
    if (!expired || expired.length === 0) return;

    // load ptero config
    let cfg = {};
    try {
      const txt = fs.readFileSync(path.join(__dirname, 'config', 'config.json'), 'utf8');
      cfg = JSON.parse(txt || '{}');
    } catch (e) { cfg = {}; }
    const ptero = cfg.pterodactyl || {};
    const base = (ptero.url || '').trim();
    const key = (ptero.api_key || '').trim();

    const doRequest = (urlObj, options = {}, body = null) => new Promise((resolve, reject) => {
      const lib = urlObj.protocol === 'https:' ? https : http;
      const req = lib.request(urlObj, options, (rsp) => {
        let d = '';
        rsp.on('data', (c) => d += c);
        rsp.on('end', () => resolve({ status: rsp.statusCode, body: d }));
      });
      req.on('error', (e) => reject(e));
      if (body) req.write(body);
      req.end();
    });

    for (const o of expired) {
      try {
        const serverId = o.ptero_server_id || null;
        if (base && key && serverId) {
          const url = new URL(`/api/application/servers/${serverId}/suspend`, base);
          try {
            const resp = await doRequest(url, { method: 'POST', headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
            let parsed = null; try { parsed = JSON.parse(resp.body || '{}'); } catch (e) { parsed = { raw: resp.body }; }
            await PlansDB.markOrderProvisionResult(o.id, serverId, parsed, 'suspended');
          } catch (e) {
            console.error('Failed to suspend expired server on Pterodactyl for order', o.id, e);
            try { await PlansDB.updateOrderStatus(o.id, 'suspended'); } catch (ee) { console.error('Failed to mark local status suspended', ee); }
          }
        } else {
          // no ptero config or server id — just mark suspended locally
          try { await PlansDB.updateOrderStatus(o.id, 'suspended'); } catch (e) { console.error('Failed to mark local order suspended', e); }
        }
      } catch (e) { console.error('Error processing expired order', o && o.id, e); }
    }
  } catch (e) {
    console.error('Failed to check expired orders', e);
  }
}

// run at startup and then every 5 minutes
checkExpiredOrders().catch(() => {});
setInterval(() => { checkExpiredOrders().catch(() => {}); }, 5 * 60 * 1000);