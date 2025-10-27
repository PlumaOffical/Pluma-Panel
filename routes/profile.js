const express = require('express');
const router = express.Router();
const { ensureAuth } = require('../middleware/auth');
const Profile = require('../controllers/profileController');

router.get('/', ensureAuth, Profile.showProfile);
router.post('/username', ensureAuth, Profile.updateUsername);
router.post('/password', ensureAuth, Profile.updatePassword);

module.exports = router;
