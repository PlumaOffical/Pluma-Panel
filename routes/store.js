const express = require('express');
const router = express.Router();
const { ensureAuth } = require('../middleware/auth');
const Store = require('../controllers/storeController');

router.get('/', Store.showStore);
router.get('/checkout/:id', ensureAuth, Store.showCheckout);
router.post('/checkout/:id', ensureAuth, Store.postCheckout);

module.exports = router;
