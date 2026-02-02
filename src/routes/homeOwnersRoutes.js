const express = require('express');
const router = express.Router();
const HomeOwnersController = require('../controllers/homeOwnersController');

// Public/Agent calculation
router.post('/calculate', HomeOwnersController.calculate);
router.get('/options', HomeOwnersController.getOptions);
router.get('/products', HomeOwnersController.getProducts);
router.get('/history', HomeOwnersController.getHistory);

module.exports = router;
