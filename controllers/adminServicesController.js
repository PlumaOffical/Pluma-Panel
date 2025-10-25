const PlansDB = require('../db/plans');

async function index(req, res) {
  try {
    const orders = await PlansDB.getAllOrders();
    res.render('admin/services', { orders });
  } catch (e) {
    console.error(e);
    res.status(500).send('Failed to load services');
  }
}

// suspend: set status to 'suspended'
async function suspend(req, res) {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.redirect('/admin/services');
    await PlansDB.updateOrderStatus(id, 'suspended');
    res.redirect('/admin/services');
  } catch (e) {
    console.error(e);
    res.status(500).send('Failed to suspend service');
  }
}

// delete: remove order (and optionally call Pterodactyl delete later)
async function remove(req, res) {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.redirect('/admin/services');
    await PlansDB.deleteOrder(id);
    res.redirect('/admin/services');
  } catch (e) {
    console.error(e);
    res.status(500).send('Failed to delete service');
  }
}

module.exports = {
  index,
  suspend,
  remove,
};
