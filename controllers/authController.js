const bcrypt = require('bcryptjs');
const Users = require('../db/init');

exports.showRegister = (req, res) => res.render('auth/register', { error: null });
exports.showLogin = (req, res) => res.render('auth/login', { error: null });

exports.register = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.render('auth/register', { error: 'Missing fields' });

    const existing = await Users.findByUsername(username);
    if (existing) return res.render('auth/register', { error: 'User already exists' });

    const hash = bcrypt.hashSync(password, 10);
    const id = await Users.createUser(username, hash);
    req.session.user = { id, username };
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

    req.session.user = { id: user.id, username: user.username };
    res.redirect('/');
  } catch (err) {
    console.error('Login error', err);
    res.status(500).send('DB error');
  }
};

exports.logout = (req, res) => {
  req.session.destroy(() => res.redirect('/auth/login'));
};