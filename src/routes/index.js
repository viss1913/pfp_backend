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
const { restrictTo } = require('../middlewares/roleMiddleware');
const agentComonStrategyRoutes = require('./agentComonStrategyRoutes');

// Public routes
router.use('/auth', authRoutes);

// Public Constructor Webhooks (no auth, no tenant middleware)
const constructorController = require('../controllers/constructorController');
router.post('/pfp/constructor/webhook/max/:botId', constructorController.handleMaxWebhook);
router.post('/admin/constructor/webhook/max/:botId', constructorController.handleMaxWebhook);

// Public Constructor Site Chat (SSE, no auth; project resolved by x-project-key via tenantMiddleware)
router.post('/pfp/constructor/site-chat/stream', tenantMiddleware, constructorController.handleSiteChatStream);
router.get('/pfp/constructor/site-chat/report-pdf', constructorController.getSiteChatReportPdf.bind(constructorController));

// Helper for combined auth + tenant
const pfpMiddleware = [authMiddleware, tenantMiddleware];

// Client Routes (some might be public but first-run is protected)
router.use('/client', clientRoutes);
// Agent view on clients (B2C clients hub in Agent LK)
const agentClientRoutes = require('./agentClientRoutes');
router.use('/pfp/clients', pfpMiddleware, agentClientRoutes);

// Protected PFP routes (require authentication + project context)
router.use('/pfp/products', pfpMiddleware, productRoutes);
router.use('/pfp/product-types', pfpMiddleware, productTypeRoutes);
router.use('/pfp/portfolios', pfpMiddleware, portfolioRoutes);
router.use('/pfp/settings', pfpMiddleware, settingsRoutes);
router.use('/pfp/agents', pfpMiddleware, agentRoutes);
router.use(
    '/pfp/agent/comon-strategies',
    pfpMiddleware,
    restrictTo('agent', 'admin', 'super_admin'),
    agentComonStrategyRoutes
);

// Admin Routes (reusing authMiddleware for now, should add admin check later)
const adminAiRoutes = require('./adminAiRoutes');
router.use('/admin/ai-assistants', pfpMiddleware, adminAiRoutes);

// Agent AI Routes (ai-b2c MUST be before /pfp/ai, else /pfp/ai matches /pfp/ai-b2c and 404)
const agentAiB2cRoutes = require('./agentAiB2cRoutes');
router.use('/pfp/ai-b2c', pfpMiddleware, agentAiB2cRoutes);

// Agent AI Routes (chat_AI contexts)
const agentAiB2cChatRoutes = require('./agentAiB2cChatRoutes');
router.use('/pfp/ai-b2c-chat', pfpMiddleware, agentAiB2cChatRoutes);

const aiRoutes = require('./aiRoutes');
router.use('/pfp/ai', pfpMiddleware, aiRoutes);
// CRM Routes
const crmRoutes = require('./crmRoutes');
router.use('/pfp/crm', pfpMiddleware, crmRoutes);
// Report Routes
const reportRoutes = require('./reportRoutes');
router.use('/pfp/reports', pfpMiddleware, reportRoutes);

const pdfSettingsRoutes = require('./pdfSettingsRoutes');
router.use('/pfp/pdf-settings', pfpMiddleware, pdfSettingsRoutes);

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

router.use('/admin/pfp', pfpMiddleware, adminPfpRoutes);
router.use('/admin/projects', pfpMiddleware, restrictTo('super_admin'), adminProjectRoutes);
router.use('/admin/users', pfpMiddleware, adminUserRoutes);

// Alias for potentially mismatched frontend path:
router.use('/ai', pfpMiddleware, aiRoutes);
// Alias for direct /chat/stream path (mapping /api/chat/stream):
router.use('/', pfpMiddleware, aiRoutes);

// AI B2C Admin Routes (brain contexts + stage contexts management)
const aiB2cRoutes = require('./aiB2cRoutes');
router.use('/admin/ai-b2c', pfpMiddleware, aiB2cRoutes);

// Client Cabinet Routes (personal cabinet for self-registered clients)
const clientCabinetRoutes = require('./clientCabinetRoutes');
router.use('/my', pfpMiddleware, clientCabinetRoutes);

// Macro Data Routes
const macroRoutes = require('./macroRoutes');
router.use('/pfp/macro', pfpMiddleware, macroRoutes);

// Comon / Finam strategies (прокси + разбор публичной страницы)
const comonRoutes = require('./comonRoutes');
router.use('/pfp/comon', pfpMiddleware, comonRoutes);

module.exports = router;

