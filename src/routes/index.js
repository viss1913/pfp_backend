const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const authRoutes = require('./authRoutes');
const productRoutes = require('./productRoutes');
const portfolioRoutes = require('./portfolioRoutes');
const settingsRoutes = require('./settingsRoutes');

const router = express.Router();

// Public auth routes (no middleware)
router.use('/auth', authRoutes);

// Protected PFP routes (require authentication)
router.use('/pfp/products', authMiddleware, productRoutes);
router.use('/pfp/portfolios', authMiddleware, portfolioRoutes);
router.use('/pfp/settings', authMiddleware, settingsRoutes);

module.exports = router;
