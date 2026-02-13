const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const authRoutes = require('./authRoutes');
const productRoutes = require('./productRoutes');
const productTypeRoutes = require('./productTypeRoutes');
const portfolioRoutes = require('./portfolioRoutes');
const settingsRoutes = require('./settingsRoutes');
const clientRoutes = require('./clientRoutes');
const agentRoutes = require('./agentRoutes');

const router = express.Router();
const tenantMiddleware = require('../middlewares/tenantMiddleware');

// Public auth routes (no middleware)
router.use('/auth', authRoutes);

// Helper for combined auth + tenant
const pfpMiddleware = [authMiddleware, tenantMiddleware];

// Client Routes (some might be public but first-run is protected)
router.use('/client', clientRoutes);

// Protected PFP routes (require authentication + project context)
router.use('/pfp/products', pfpMiddleware, productRoutes);
router.use('/pfp/product-types', pfpMiddleware, productTypeRoutes);
router.use('/pfp/portfolios', pfpMiddleware, portfolioRoutes);
router.use('/pfp/settings', pfpMiddleware, settingsRoutes);
router.use('/pfp/agents', pfpMiddleware, agentRoutes);

// Admin Routes (reusing authMiddleware for now, should add admin check later)
const adminAiRoutes = require('./adminAiRoutes');
router.use('/admin/ai-assistants', pfpMiddleware, adminAiRoutes);

// Agent AI Routes
const aiRoutes = require('./aiRoutes');
router.use('/pfp/ai', pfpMiddleware, aiRoutes);
// CRM Routes
const crmRoutes = require('./crmRoutes');
router.use('/pfp/crm', pfpMiddleware, crmRoutes);
// Report Routes
const reportRoutes = require('./reportRoutes');
router.use('/pfp/reports', pfpMiddleware, reportRoutes);

// Constructor Routes
const constructorRoutes = require('./constructorRoutes');
router.use('/pfp/constructor', pfpMiddleware, constructorRoutes);
router.use('/admin/constructor', pfpMiddleware, constructorRoutes); // Reusing same router, internal paths handle prefixes

// Home Owners (Insurance) Routes
const homeOwnersRoutes = require('./homeOwnersRoutes');
const adminHomeOwnersRoutes = require('./adminHomeOwnersRoutes');
router.use('/pfp/insurance/home-owners', pfpMiddleware, homeOwnersRoutes);
router.use('/admin/insurance/home-owners', pfpMiddleware, adminHomeOwnersRoutes);

// Admin PFP Routes
const adminPfpRoutes = require('./adminPfpRoutes');
const adminProjectRoutes = require('./adminProjectRoutes');
const adminUserRoutes = require('./adminUserRoutes');
const { restrictTo } = require('../middlewares/roleMiddleware');

router.use('/admin/pfp', pfpMiddleware, adminPfpRoutes);
router.use('/admin/projects', pfpMiddleware, restrictTo('super_admin'), adminProjectRoutes);
router.use('/admin/users', pfpMiddleware, adminUserRoutes);

// Alias for potentially mismatched frontend path:
router.use('/ai', pfpMiddleware, aiRoutes);
// Alias for direct /chat/stream path (mapping /api/chat/stream):
router.use('/', pfpMiddleware, aiRoutes);

module.exports = router;
