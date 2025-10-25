const express = require('express');
const router = express.Router();
const { ensureAuth, ensureAdmin } = require('../middleware/auth');
const AdminServices = require('../controllers/adminServicesController');

router.get('/', ensureAuth, ensureAdmin, AdminServices.index);
router.post('/:id/suspend', ensureAuth, ensureAdmin, AdminServices.suspend);
router.post('/:id/delete', ensureAuth, ensureAdmin, AdminServices.remove);

module.exports = router;
