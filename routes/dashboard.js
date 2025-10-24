const express = require('express');
const router = express.Router();

function ensureAuth(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/auth/login');
}

router.get('/', ensureAuth, (req, res) => {
  res.render('index', { user: req.session.user });
});

module.exports = router;