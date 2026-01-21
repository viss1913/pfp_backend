const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const authMiddleware = require('../middlewares/authMiddleware');

// GET /api/pfp/reports/:clientId - Get structured data for PDF report
router.get('/:clientId', authMiddleware, reportController.getClientReport);

module.exports = router;
