const express = require('express');
const router = express.Router();
const Services = require('../controllers/servicesController');
const { ensureAuth } = require('../middleware/auth');

router.get('/', ensureAuth, Services.index);
router.post('/:id/renew', ensureAuth, Services.renew);

module.exports = router;
