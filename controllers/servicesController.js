const PlansDB = require('../db/plans');
const fs = require('fs').promises;
const path = require('path');

async function index(req, res) {
  try {
    if (!req.session || !req.session.user) return res.redirect('/auth/login');
    const userId = req.session.user.id;
    const orders = await PlansDB.getOrdersByUser(userId);

    // read config to get pterodactyl panel url for 'Manage' links
    let pteroUrl = null;
    try {
      const cfgPath = path.join(__dirname, '..', 'config', 'config.json');
      const txt = await fs.readFile(cfgPath, 'utf8');
      const cfg = JSON.parse(txt || '{}');
      pteroUrl = cfg && cfg.pterodactyl && cfg.pterodactyl.url ? (cfg.pterodactyl.url.replace(/\/$/, '')) : null;
    } catch (e) {
      // ignore, leave pteroUrl null
    }

    res.render('services/services', { orders, pteroUrl });
  } catch (e) {
    console.error(e);
    res.status(500).send('Failed to load services');
  }
}

module.exports = { index };
