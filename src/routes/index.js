const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const authRoutes = require('./authRoutes');
const productRoutes = require('./productRoutes');
const productTypeRoutes = require('./productTypeRoutes');
const portfolioRoutes = require('./portfolioRoutes');
const settingsRoutes = require('./settingsRoutes');
const clientRoutes = require('./clientRoutes');

const router = express.Router();

// Public auth routes (no middleware)
router.use('/auth', authRoutes);
router.use('/client', clientRoutes);

// Protected PFP routes (require authentication)
router.use('/pfp/products', authMiddleware, productRoutes);
router.use('/pfp/product-types', authMiddleware, productTypeRoutes);
router.use('/pfp/portfolios', authMiddleware, portfolioRoutes);
router.use('/pfp/settings', authMiddleware, settingsRoutes);

// Admin Routes (reusing authMiddleware for now, should add admin check later)
const adminAiRoutes = require('./adminAiRoutes');
router.use('/admin/ai-assistants', authMiddleware, adminAiRoutes);

// Agent AI Routes
const aiRoutes = require('./aiRoutes');
router.use('/pfp/ai', authMiddleware, aiRoutes);

module.exports = router;
