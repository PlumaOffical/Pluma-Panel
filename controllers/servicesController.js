const PlansDB = require('../db/plans');

async function index(req, res) {
  try {
    if (!req.session || !req.session.user) return res.redirect('/auth/login');
    const userId = req.session.user.id;
    const orders = await PlansDB.getOrdersByUser(userId);
    res.render('services/services', { orders });
  } catch (e) {
    console.error(e);
    res.status(500).send('Failed to load services');
  }
}

module.exports = { index };
