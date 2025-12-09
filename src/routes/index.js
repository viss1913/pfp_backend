const express = require('express');
const router = express.Router();
const productRoutes = require('./productRoutes');
const portfolioRoutes = require('./portfolioRoutes');
const settingsRoutes = require('./settingsRoutes');
const authMiddleware = require('../middlewares/authMiddleware');

// All PFP routes require auth
router.use(authMiddleware);

router.use('/products', productRoutes);
router.use('/portfolios', portfolioRoutes);
router.use('/settings', settingsRoutes);

module.exports = router;
