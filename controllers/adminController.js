const UsersAdmin = require('../db/usersAdmin');

exports.listUsers = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = 15;
    const [users, total] = await Promise.all([
      UsersAdmin.getUsers(page, limit),
      UsersAdmin.countUsers(),
    ]);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    res.render('admin/users', { users, page, totalPages });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
};

exports.makeAdmin = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await UsersAdmin.setAdminFlag(id, 1);
    res.redirect(req.get('referer') || '/admin/users');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
};

exports.unadmin = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    // prevent an admin from removing their own admin flag
    const actorId = req.session && req.session.user ? req.session.user.id : null;
    if (actorId && actorId === id) {
      // don't allow self-unadmin for safety
      return res.status(400).send('You cannot remove your own admin rights');
    }
    await UsersAdmin.setAdminFlag(id, 0);
    res.redirect(req.get('referer') || '/admin/users');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const actorId = req.session && req.session.user ? req.session.user.id : null;
    // archive then delete (will reject if user is admin)
    await UsersAdmin.archiveAndDeleteUser(id, actorId);
    res.redirect(req.get('referer') || '/admin/users');
  } catch (err) {
    console.error(err);
    if (err.message && err.message.includes('Cannot delete an admin')) {
      return res.status(400).send('Cannot delete an admin account');
    }
    res.status(500).send('Server error');
  }
};

// list archived users
exports.listArchived = async (req, res) => {
  try {
    const archived = await UsersAdmin.getArchivedUsers();
    res.render('admin/archived', { archived });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
};

exports.adjustCoins = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    let { amount, action } = req.body || {};
    amount = parseFloat(amount);
    if (isNaN(amount) || amount <= 0) return res.status(400).send('Invalid amount');
    const delta = action === 'remove' ? -Math.abs(amount) : Math.abs(amount);
    const newBalance = await UsersAdmin.adjustBalance(id, delta);
    // if user not found, return 404
    if (newBalance === null) return res.status(404).send('User not found');
    res.json({ ok: true, newBalance });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
};