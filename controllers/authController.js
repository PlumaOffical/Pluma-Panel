const bcrypt = require('bcryptjs');
const Users = require('../db/init');

exports.showRegister = (req, res) => res.render('auth/register', { error: null });
exports.showLogin = (req, res) => res.render('auth/login', { error: null });

exports.register = async (req, res) => {
  try {
    const { username, password, email } = req.body;
    if (!username || !password || !email) return res.render('auth/register', { error: 'Missing fields' });

    // basic email validation
    const em = String(email || '').trim().toLowerCase();
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(em)) return res.render('auth/register', { error: 'Invalid email address' });

    const existing = await Users.findByUsername(username);
    if (existing) return res.render('auth/register', { error: 'User already exists' });

    const existingEmail = await Users.findByEmail(em);
    if (existingEmail) return res.render('auth/register', { error: 'Email already in use' });

    const hash = bcrypt.hashSync(password, 10);
    const id = await Users.createUser(username, hash, em);
    // new users are not admins by default
    req.session.user = { id, username, email: em, is_admin: 0 };
    res.redirect('/');
  } catch (err) {
    console.error('Register error', err);
    res.status(500).send('DB error');
  }
};

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.render('auth/login', { error: 'Missing fields' });

    const user = await Users.findByUsername(username);
    if (!user) return res.render('auth/login', { error: 'Invalid credentials' });

    const ok = bcrypt.compareSync(password, user.password);
    if (!ok) return res.render('auth/login', { error: 'Invalid credentials' });

  // include is_admin flag in session for authorization checks
  req.session.user = { id: user.id, username: user.username, is_admin: user.is_admin ? 1 : 0 };
    res.redirect('/');
  } catch (err) {
    console.error('Login error', err);
    res.status(500).send('DB error');
  }
};

exports.logout = (req, res) => {
  req.session.destroy(() => res.redirect('/auth/login'));
};