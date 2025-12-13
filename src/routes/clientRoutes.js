const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');

router.post('/calculate', clientController.calculateFirstRun);

module.exports = router;
