const express = require('express');
const router = express.Router();
const auth = require('../controllers/authController');
const { ensureGuest } = require('../middleware/auth');

router.get('/register', ensureGuest, auth.showRegister);
router.post('/register', ensureGuest, auth.register);

router.get('/login', ensureGuest, auth.showLogin);
router.post('/login', ensureGuest, auth.login);

router.post('/logout', auth.logout);

module.exports = router;