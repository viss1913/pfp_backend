const express = require('express');
const router = express.Router();
const resolutController = require('../controllers/resolutController');
const { restrictTo } = require('../middlewares/roleMiddleware');

router.post('/products', restrictTo('agent', 'admin', 'super_admin'), resolutController.products.bind(resolutController));
router.post('/quote', restrictTo('agent', 'admin', 'super_admin'), resolutController.quote.bind(resolutController));

module.exports = router;
