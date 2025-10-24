const express = require('express');
const router = express.Router();
const adminCtrl = require('../controllers/adminController');
const { ensureAuth, ensureAdmin } = require('../middleware/auth');

// List users (page query param)
router.get('/', ensureAuth, ensureAdmin, adminCtrl.listUsers);

// show archived users
router.get('/archived', ensureAuth, ensureAdmin, adminCtrl.listArchived);

// Actions: make admin, unadmin, delete (POST)
router.post('/:id/make-admin', ensureAuth, ensureAdmin, adminCtrl.makeAdmin);
router.post('/:id/unadmin', ensureAuth, ensureAdmin, adminCtrl.unadmin);
router.post('/:id/delete', ensureAuth, ensureAdmin, adminCtrl.deleteUser);
// Adjust coins (add / remove) via JSON POST { amount, action: 'add'|'remove' }
router.post('/:id/coins', ensureAuth, ensureAdmin, adminCtrl.adjustCoins);

module.exports = router;