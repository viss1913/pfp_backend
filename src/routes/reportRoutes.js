const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const reportPagesController = require('../controllers/reportPagesController');
const authMiddleware = require('../middlewares/authMiddleware');

// GET /api/pfp/reports/:clientId/pdf - generate and return ready PDF report
// query:
// - includeCover=true|false (default true)
// - includeSummary=true|false (default true)
// - goalTypes=FIN_RESERVE,LIFE,INVESTMENT,OTHER (optional subset)
router.get('/:clientId/pdf', authMiddleware, reportController.getClientReportPdf);
router.get('/:clientId/html', authMiddleware, reportController.getClientReportHtml);

// GET /api/pfp/reports/:clientId/pdf-url - generate, upload and return PDF URL + toc
router.get('/:clientId/pdf-url', authMiddleware, reportController.getClientReportPdfUrl);

// GET /api/pfp/reports/:clientId/pages/:pageType/html - get goal page HTML for PDF printing
// pageType: SUMMARY | FIN_RESERVE | LIFE | INVESTMENT | OTHER
router.get('/:clientId/pages/:pageType/html', authMiddleware, reportPagesController.getPageHtml);

// GET /api/pfp/reports/:clientId - Get structured data for PDF report (после более специфичных путей)
router.get('/:clientId', authMiddleware, reportController.getClientReport);

module.exports = router;
