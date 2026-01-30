const express = require('express');
const router = express.Router();
const constructorController = require('../controllers/constructorController');

// Агентские роуты (будут под /api/pfp/constructor)
router.post('/bot', constructorController.registerBot);
router.get('/bot', constructorController.getMyBot);
router.get('/clients', constructorController.getMyClients);
router.get('/messages/:clientId', constructorController.getMessages);
router.post('/send-message', constructorController.sendMessage);
router.post('/broadcast', constructorController.broadcast);

// Админские роуты
router.get('/bots', constructorController.getAllBots);
router.post('/templates', constructorController.createTemplate);
router.get('/templates', constructorController.getTemplates);

// Brain Contexts (Admin)
router.get('/brain-contexts', constructorController.getBrainContexts);
router.get('/constructor_brain_contexts', constructorController.getBrainContexts);
router.post('/brain-contexts', constructorController.createBrainContext);
router.post('/constructor_brain_contexts', constructorController.createBrainContext);
router.put('/brain-contexts/:id', constructorController.updateBrainContext);
router.put('/constructor_brain_contexts/:id', constructorController.updateBrainContext);
router.delete('/brain-contexts/:id', constructorController.deleteBrainContext);
router.delete('/constructor_brain_contexts/:id', constructorController.deleteBrainContext);

module.exports = router;
