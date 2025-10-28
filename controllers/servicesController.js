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

    // compute renew availability: renew allowed only after 15 days from created_at
    const now = new Date();
    const msPerDay = 24 * 60 * 60 * 1000;
    const enriched = (orders || []).map(o => {
      let renewAvailable = false;
      let remainingDays = 0;
      try {
        const created = new Date(o.created_at);
        if (!isNaN(created)) {
          const diffDays = Math.floor((now - created) / msPerDay);
          renewAvailable = diffDays >= 15;
          remainingDays = renewAvailable ? 0 : Math.max(0, 15 - diffDays);
        }
      } catch (e) { renewAvailable = false; remainingDays = 15; }
      return Object.assign({}, o, { renewAvailable, remainingDays });
    });

    res.render('services/services', { orders: enriched, pteroUrl });
  } catch (e) {
    console.error(e);
    res.status(500).send('Failed to load services');
  }
}

async function renew(req, res) {
  try {
    if (!req.session || !req.session.user) return res.redirect('/auth/login');
    const userId = req.session.user.id;
    const id = parseInt(req.params.id);
    if (!id) return res.redirect('/services');
    const order = await PlansDB.getOrderById(id);
    if (!order || Number(order.user_id) !== Number(userId)) return res.redirect('/services');

    // check 15 day rule
    const created = new Date(order.created_at);
    const now2 = new Date();
    const msPerDay2 = 24 * 60 * 60 * 1000;
    const diffDays2 = Math.floor((now2 - created) / msPerDay2);
    if (diffDays2 < 15) {
      // not allowed yet
      // compute pteroUrl for render
      let pteroUrl = null;
      try {
        const cfgPath = path.join(__dirname, '..', 'config', 'config.json');
        const txt = await fs.readFile(cfgPath, 'utf8');
        const cfg = JSON.parse(txt || '{}');
        pteroUrl = cfg && cfg.pterodactyl && cfg.pterodactyl.url ? (cfg.pterodactyl.url.replace(/\/$/, '')) : null;
      } catch (e) { }
      const orders = await PlansDB.getOrdersByUser(userId);
      return res.render('services/services', { orders, pteroUrl, notify: { type: 'error', text: 'Renewal is not available until 15 days after creation.' } });
    }

    // compute extension based on plan.billing_cycle
    const plan = await PlansDB.getPlanById(order.plan_id);
    const days = (plan && plan.billing_cycle && String(plan.billing_cycle).toLowerCase().includes('year')) ? 365 : 30;
    const currentExp = order.expires_at ? new Date(order.expires_at) : now2;
    const newExp = new Date(currentExp.getTime() + days * msPerDay2);
    await PlansDB.updateOrderExpires(id, newExp.toISOString());

    // refresh and render services with success notice
    let pteroUrl = null;
    try {
      const cfgPath = path.join(__dirname, '..', 'config', 'config.json');
      const txt = await fs.readFile(cfgPath, 'utf8');
      const cfg = JSON.parse(txt || '{}');
      pteroUrl = cfg && cfg.pterodactyl && cfg.pterodactyl.url ? (cfg.pterodactyl.url.replace(/\/$/, '')) : null;
    } catch (e) { }
    const orders = await PlansDB.getOrdersByUser(userId);
    return res.render('services/services', { orders, pteroUrl, notify: { type: 'success', text: 'Service renewed successfully.' } });
  } catch (e) {
    console.error('Failed to renew order', e);
    res.status(500).send('Failed to renew service');
  }
}

module.exports = { index, renew };
