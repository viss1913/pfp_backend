const express = require('express');
const router = express.Router();
const resolutController = require('../controllers/resolutController');
const { restrictTo } = require('../middlewares/roleMiddleware');

router.post('/products', restrictTo('agent', 'admin', 'super_admin'), resolutController.products);
router.post('/quote', restrictTo('agent', 'admin', 'super_admin'), resolutController.quote);

module.exports = router;
