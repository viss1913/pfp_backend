const express = require('express');
const agentComonStrategyController = require('../controllers/agentComonStrategyController');

const router = express.Router();

router.get('/', agentComonStrategyController.list);
router.post('/', agentComonStrategyController.create);
router.get('/:id/preview', agentComonStrategyController.preview);
router.get('/:id/profit/metrics', agentComonStrategyController.profitMetrics);
router.get('/:id/profit', agentComonStrategyController.profit);
router.get('/:id', agentComonStrategyController.getOne);
router.patch('/:id', agentComonStrategyController.patch);
router.delete('/:id', agentComonStrategyController.remove);

module.exports = router;
