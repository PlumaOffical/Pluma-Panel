const express = require('express');
const router = express.Router();
const { ensureAuth, ensureAdmin } = require('../middleware/auth');

router.get('/', ensureAuth, ensureAdmin, (req, res) => {
  // render a simple admin page; view exists at views/admin/admin.ejs
  res.render('admin/admin');
});

module.exports = router;
