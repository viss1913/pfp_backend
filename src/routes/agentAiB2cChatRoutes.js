const express = require('express');
const router = express.Router();

const aiB2cController = require('../controllers/aiB2cController');
const authMiddleware = require('../middlewares/authMiddleware');
const tenantMiddleware = require('../middlewares/tenantMiddleware');
const { restrictTo } = require('../middlewares/roleMiddleware');

// Доступ: агент + админские роли внутри своего проекта
const agentAiMiddleware = [authMiddleware, tenantMiddleware, restrictTo('agent', 'admin', 'super_admin')];

// ==================== Brain Contexts (chat_AI) ====================
router.get('/brain-contexts', agentAiMiddleware, aiB2cController.getAiB2cChatAiBrainContexts.bind(aiB2cController));
router.post('/brain-contexts', agentAiMiddleware, aiB2cController.createAiB2cChatAiBrainContext.bind(aiB2cController));
router.put('/brain-contexts/:id', agentAiMiddleware, aiB2cController.updateAiB2cChatAiBrainContext.bind(aiB2cController));
router.delete('/brain-contexts/:id', agentAiMiddleware, aiB2cController.deleteAiB2cChatAiBrainContext.bind(aiB2cController));

// ==================== Stage Contexts (chat_AI) ====================
router.get('/stages', agentAiMiddleware, aiB2cController.getAiB2cChatStages.bind(aiB2cController));
router.post('/stages', agentAiMiddleware, aiB2cController.createAiB2cChatStage.bind(aiB2cController));
router.put('/stages/:id', agentAiMiddleware, aiB2cController.updateAiB2cChatStage.bind(aiB2cController));
router.delete('/stages/:id', agentAiMiddleware, aiB2cController.deleteAiB2cChatStage.bind(aiB2cController));

module.exports = router;

