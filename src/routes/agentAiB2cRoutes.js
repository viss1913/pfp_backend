const express = require('express');
const router = express.Router();
const aiB2cController = require('../controllers/aiB2cController');
const authMiddleware = require('../middlewares/authMiddleware');
const tenantMiddleware = require('../middlewares/tenantMiddleware');
const { restrictTo } = require('../middlewares/roleMiddleware');

// Доступ: агент + админские роли внутри своего проекта
const agentAiMiddleware = [authMiddleware, tenantMiddleware, restrictTo('agent', 'admin', 'super_admin')];

// Brain Contexts (в скоупе проекта агента)
router.get('/brain-contexts', agentAiMiddleware, aiB2cController.getAiB2cBrainContexts.bind(aiB2cController));
router.post('/brain-contexts', agentAiMiddleware, aiB2cController.createAiB2cBrainContext.bind(aiB2cController));
router.put('/brain-contexts/:id', agentAiMiddleware, aiB2cController.updateAiB2cBrainContext.bind(aiB2cController));
router.delete('/brain-contexts/:id', agentAiMiddleware, aiB2cController.deleteAiB2cBrainContext.bind(aiB2cController));

// Stage Contexts (сценарии/этапы ИИ в проекте агента)
router.get('/stages', agentAiMiddleware, aiB2cController.getAiB2cStages.bind(aiB2cController));
router.post('/stages', agentAiMiddleware, aiB2cController.createAiB2cStage.bind(aiB2cController));
router.put('/stages/:id', agentAiMiddleware, aiB2cController.updateAiB2cStage.bind(aiB2cController));
router.delete('/stages/:id', agentAiMiddleware, aiB2cController.deleteAiB2cStage.bind(aiB2cController));

module.exports = router;

