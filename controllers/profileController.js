const Users = require('../db/init');
const bcrypt = require('bcryptjs');

async function showProfile(req, res) {
  try {
    if (!req.session || !req.session.user) return res.redirect('/auth/login');
    const userId = req.session.user.id;
    const user = await Users.findById(userId);
    res.render('profile', { user, notify: null });
  } catch (e) {
    console.error(e);
    res.status(500).send('Failed to load profile');
  }
}

async function updateUsername(req, res) {
  try {
    if (!req.session || !req.session.user) return res.redirect('/auth/login');
    const userId = req.session.user.id;
    const newUsername = String(req.body.username || '').trim();
    if (!newUsername) {
      const u = await Users.findById(userId);
      return res.render('profile', { user: u, notify: { type: 'error', text: 'Username cannot be empty.' } });
    }
    // check uniqueness
    const existing = await Users.findByUsername(newUsername);
    if (existing && Number(existing.id) !== Number(userId)) {
      const u = await Users.findById(userId);
      return res.render('profile', { user: u, notify: { type: 'error', text: 'Username already taken.' } });
    }
    await Users.updateUsername(userId, newUsername);
    // update session
    if (req.session && req.session.user) req.session.user.username = newUsername;
    const u = await Users.findById(userId);
    return res.render('profile', { user: u, notify: { type: 'success', text: 'Username updated.' } });
  } catch (e) {
    console.error(e);
    res.status(500).send('Failed to update username');
  }
}

async function updatePassword(req, res) {
  try {
    if (!req.session || !req.session.user) return res.redirect('/auth/login');
    const userId = req.session.user.id;
    const current = String(req.body.current_password || '');
    const nw = String(req.body.new_password || '');
    const confirm = String(req.body.confirm_password || '');
    const u = await Users.findById(userId);
    if (!u) return res.redirect('/auth/login');
    // validate current password (passwords are stored hashed using bcrypt)
    if (!bcrypt.compareSync(current, String(u.password || ''))) {
      return res.render('profile', { user: u, notify: { type: 'error', text: 'Current password is incorrect.' } });
    }
    if (!nw || nw.length < 6) {
      return res.render('profile', { user: u, notify: { type: 'error', text: 'New password must be at least 6 characters.' } });
    }
    if (nw !== confirm) {
      return res.render('profile', { user: u, notify: { type: 'error', text: 'New password and confirmation do not match.' } });
    }
  // hash the new password before storing
  const hashed = bcrypt.hashSync(nw, 10);
  await Users.updatePassword(userId, hashed);
  // don't store plaintext password in session; keep session user minimal (id, username, is_admin)
    const u2 = await Users.findById(userId);
    return res.render('profile', { user: u2, notify: { type: 'success', text: 'Password changed successfully.' } });
  } catch (e) {
    console.error(e);
    res.status(500).send('Failed to change password');
  }
}

module.exports = { showProfile, updateUsername, updatePassword };
