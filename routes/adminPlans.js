const express = require('express');
const router = express.Router();
const { ensureAuth, ensureAdmin } = require('../middleware/auth');
const AdminPlans = require('../controllers/adminPlansController');

router.get('/', ensureAuth, ensureAdmin, AdminPlans.index);
router.post('/create', ensureAuth, ensureAdmin, AdminPlans.create);
router.post('/:id/delete', ensureAuth, ensureAdmin, AdminPlans.remove);

module.exports = router;
