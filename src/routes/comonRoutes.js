const express = require('express');
const router = express.Router();
const comonController = require('../controllers/comonController');

router.get('/maintenance-info', comonController.getMaintenanceInfo);
router.post('/strategies/resolve', comonController.resolveStrategyFromUrl);
router.get('/strategies/:id/profit', comonController.getStrategyProfit);
router.get('/strategies/:id/details', comonController.getStrategyDetails);
router.get('/strategies/:id', comonController.getStrategy);

module.exports = router;
