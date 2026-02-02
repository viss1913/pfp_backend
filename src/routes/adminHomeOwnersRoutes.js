const express = require('express');
const router = express.Router();
const HomeOwnersController = require('../controllers/homeOwnersController');

// Admin management
router.get('/products', HomeOwnersController.getProducts);
router.post('/products', HomeOwnersController.upsertProduct);
router.get('/tariffs', HomeOwnersController.getTariffs);
router.post('/tariffs', HomeOwnersController.upsertTariff);

module.exports = router;
