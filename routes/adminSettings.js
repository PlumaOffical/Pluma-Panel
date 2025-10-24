const express = require('express');
const router = express.Router();
const settingsCtrl = require('../controllers/settingsController');
const { ensureAuth, ensureAdmin } = require('../middleware/auth');

// show settings form
router.get('/', ensureAuth, ensureAdmin, settingsCtrl.showSettings);

// save settings
router.post('/', ensureAuth, ensureAdmin, settingsCtrl.saveSettings);

module.exports = router;
