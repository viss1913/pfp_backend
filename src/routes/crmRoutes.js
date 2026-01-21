const express = require('express');
const router = express.Router();
const crmController = require('../controllers/crmController');
const authMiddleware = require('../middlewares/authMiddleware');

// GET /api/crm/briefing - Get daily AI briefing for the agent
router.get('/briefing', authMiddleware, crmController.getDailyBriefing);

module.exports = router;
