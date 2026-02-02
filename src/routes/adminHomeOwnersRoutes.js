const express = require('express');
const router = express.Router();
const HomeOwnersController = require('../controllers/homeOwnersController');

// Admin management
router.post('/products', HomeOwnersController.upsertProduct);
router.post('/tariffs', HomeOwnersController.upsertTariff);

module.exports = router;
