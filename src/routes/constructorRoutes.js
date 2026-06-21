const express = require('express');
const router = express.Router();
const constructorController = require('../controllers/constructorController');
const {
    constructorCommandMediaUpload,
    constructorCommandMediaUploadError,
} = require('../middlewares/constructorCommandMediaUpload');

// Агентские роуты (будут под /api/pfp/constructor)
router.post('/bot', constructorController.registerBot);
router.get('/bot', constructorController.getMyBot);
router.get('/clients', constructorController.getMyClients);
router.get('/messages/:clientId', constructorController.getMessages);
router.post('/send-message', constructorController.sendMessage);
router.post('/broadcast', constructorController.broadcast);

// Админские роуты
router.get('/bots', constructorController.getAllBots);

// Конструктор команд (Универсальный: шаблоны и команды ботов)
router.get('/commands', constructorController.getCommands);
router.post('/commands', constructorController.createCommand);
router.put('/commands/:id', constructorController.updateCommand);
router.post(
    '/commands/:id/media',
    constructorCommandMediaUpload.single('file'),
    constructorCommandMediaUploadError,
    constructorController.uploadCommandMedia
);
router.delete('/commands/:id/media/:mediaId', constructorController.deleteCommandMedia);
router.delete('/commands/:id', constructorController.deleteCommand);

// Алиасы для обратной совместимости (опционально)
router.get('/templates', constructorController.getCommands);
router.post('/templates', constructorController.createCommand);
router.post('/constructor_commands', constructorController.createCommand);
router.get('/constructor_commands', constructorController.getCommands);
router.put('/templates/:id', constructorController.updateCommand);
router.patch('/templates/:id', constructorController.updateCommand);
router.put('/constructor_commands/:id', constructorController.updateCommand);
router.patch('/constructor_commands/:id', constructorController.updateCommand);
router.post(
    '/constructor_commands/:id/media',
    constructorCommandMediaUpload.single('file'),
    constructorCommandMediaUploadError,
    constructorController.uploadCommandMedia
);
router.delete('/constructor_commands/:id/media/:mediaId', constructorController.deleteCommandMedia);
router.delete('/templates/:id', constructorController.deleteCommand);
router.delete('/constructor_commands/:id', constructorController.deleteCommand);

// Brain Contexts (Admin)
router.get('/brain-contexts', constructorController.getBrainContexts);
router.get('/constructor_brain_contexts', constructorController.getBrainContexts);
router.post('/brain-contexts', constructorController.createBrainContext);
router.post('/constructor_brain_contexts', constructorController.createBrainContext);
router.put('/brain-contexts/:id', constructorController.updateBrainContext);
router.put('/constructor_brain_contexts/:id', constructorController.updateBrainContext);
router.delete('/brain-contexts/:id', constructorController.deleteBrainContext);
router.delete('/constructor_brain_contexts/:id', constructorController.deleteBrainContext);

// Public Webhooks (should be called without authMiddleware in index.js)
router.post('/webhook/max/:botId', constructorController.handleMaxWebhook);

module.exports = router;
