const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');

router.post('/calculate', clientController.calculateFirstRun);
router.post('/pds/calc-cofin', clientController.calculatePdsCofinancing);

module.exports = router;
