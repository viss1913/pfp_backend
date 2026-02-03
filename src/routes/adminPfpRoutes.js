const express = require('express');
const router = express.Router();
const adminPfpController = require('../controllers/adminPfpController');

// GET /api/admin/pfp/calculations - Get list of all client PFP states for admin
router.get('/calculations', adminPfpController.getPfpCalculations);

module.exports = router;
