const express = require('express');
const router = express.Router();
const HomeOwnersController = require('../controllers/homeOwnersController');

// Admin management
router.get('/products', HomeOwnersController.getProducts);
router.post('/products', HomeOwnersController.upsertProduct);
router.get('/tariffs', HomeOwnersController.getTariffs);
router.post('/tariffs', HomeOwnersController.upsertTariff);
router.delete('/products/:id', HomeOwnersController.deleteProduct);
router.delete('/tariffs/:id', HomeOwnersController.deleteTariff);

module.exports = router;
