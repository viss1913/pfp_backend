/**
 * AI B2C Routes
 * 
 * Админ-роуты: CRUD для brain contexts и stage contexts
 * B2C-роуты: chat, stream, history
 */

const express = require('express');
const router = express.Router();
const aiB2cController = require('../controllers/aiB2cController');
const { restrictTo } = require('../middlewares/roleMiddleware');

// ==================== ADMIN ROUTES ====================
// Доступ: admin, super_admin

// Brain Contexts
router.get('/brain-contexts', restrictTo('admin', 'super_admin'), aiB2cController.getAiB2cBrainContexts.bind(aiB2cController));
router.post('/brain-contexts', restrictTo('admin', 'super_admin'), aiB2cController.createAiB2cBrainContext.bind(aiB2cController));
router.put('/brain-contexts/:id', restrictTo('admin', 'super_admin'), aiB2cController.updateAiB2cBrainContext.bind(aiB2cController));
router.delete('/brain-contexts/:id', restrictTo('admin', 'super_admin'), aiB2cController.deleteAiB2cBrainContext.bind(aiB2cController));

// Stage Contexts
router.get('/stages', restrictTo('admin', 'super_admin'), aiB2cController.getAiB2cStages.bind(aiB2cController));
router.post('/stages', restrictTo('admin', 'super_admin'), aiB2cController.createAiB2cStage.bind(aiB2cController));
router.put('/stages/:id', restrictTo('admin', 'super_admin'), aiB2cController.updateAiB2cStage.bind(aiB2cController));
router.delete('/stages/:id', restrictTo('admin', 'super_admin'), aiB2cController.deleteAiB2cStage.bind(aiB2cController));

// Assistant Settings
router.get('/settings', restrictTo('admin', 'super_admin'), aiB2cController.getAiB2cSettings.bind(aiB2cController));
router.put('/settings', restrictTo('admin', 'super_admin'), aiB2cController.upsertAiB2cSettings.bind(aiB2cController));

module.exports = router;
