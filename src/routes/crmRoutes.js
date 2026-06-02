const express = require('express');
const router = express.Router();
const crmController = require('../controllers/crmController');
const authMiddleware = require('../middlewares/authMiddleware');

// GET /api/pfp/crm/briefing - Get daily AI briefing for the agent
router.get('/briefing', authMiddleware, crmController.getDailyBriefing);

// GET /api/pfp/crm/dashboard - CRM dashboard for "My clients" tab
router.get('/dashboard', authMiddleware, crmController.getDashboard.bind(crmController));

// GET /api/pfp/crm/commission-forecast - forecast by products and years
router.get('/commission-forecast', authMiddleware, crmController.getCommissionForecast.bind(crmController));

// POST /api/pfp/crm/status - Update client CRM status
router.post('/status', authMiddleware, crmController.updateClientStatus);

module.exports = router;
