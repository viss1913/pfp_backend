const express = require('express');
const router = express.Router();
const resolutController = require('../controllers/resolutController');
const { restrictTo } = require('../middlewares/roleMiddleware');

router.post('/products', restrictTo('agent', 'admin', 'super_admin'), resolutController.products.bind(resolutController));
router.post('/quote', restrictTo('agent', 'admin', 'super_admin'), resolutController.quote.bind(resolutController));
router.post('/portfolio', restrictTo('agent', 'admin', 'super_admin'), resolutController.portfolio.bind(resolutController));
router.post('/client', restrictTo('agent', 'admin', 'super_admin'), resolutController.client.bind(resolutController));
router.get('/client', restrictTo('agent', 'admin', 'super_admin'), resolutController.clientFetch.bind(resolutController));
router.get('/link', restrictTo('agent', 'admin', 'super_admin'), resolutController.link.bind(resolutController));
router.post('/publish-preview', restrictTo('agent', 'admin', 'super_admin'), resolutController.publishPreview.bind(resolutController));
router.post('/publish', restrictTo('agent', 'admin', 'super_admin'), resolutController.publish.bind(resolutController));
router.get('/publications', restrictTo('agent', 'admin', 'super_admin'), resolutController.publications.bind(resolutController));

module.exports = router;
