const express = require('express');
const router = express.Router();
const ptero = require('../controllers/pterodactylController');
const { ensureAuth, ensureAdmin } = require('../middleware/auth');

router.get('/', ensureAuth, ensureAdmin, ptero.show);
router.post('/save', ensureAuth, ensureAdmin, ptero.save);
router.post('/test', ensureAuth, ensureAdmin, express.json(), ptero.test);
router.post('/nodes', ensureAuth, ensureAdmin, express.json(), ptero.nodes);

module.exports = router;
