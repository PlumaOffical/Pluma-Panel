const express = require('express');
const router = express.Router();
const { ensureAuth } = require('../middleware/auth');
const Users = require('../db/init');

router.get('/', ensureAuth, async (req, res) => {
  try {
    let user = req.session.user || null;
    // if email is missing in session, fetch fresh user record from DB
    if (user && !user.email) {
      try {
        const full = await Users.findById(user.id);
        if (full) {
          user = Object.assign({}, user, { email: full.email });
          // update session cache
          req.session.user = Object.assign({}, req.session.user, { email: full.email });
        }
      } catch (e) { console.error('Failed to load user email for dashboard', e); }
    }
    res.render('index', { user });
  } catch (e) {
    console.error(e);
    res.render('index', { user: req.session.user || null });
  }
});

module.exports = router;