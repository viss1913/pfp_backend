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

// Админские роуты (будут под /api/admin/constructor)
router.get('/admin/bots', constructorController.getAllBots);
router.post('/admin/templates', constructorController.createTemplate);
router.get('/admin/templates', constructorController.getTemplates);

// Brain Contexts (Admin)
router.get('/admin/brain-contexts', constructorController.getBrainContexts);
router.post('/admin/brain-contexts', constructorController.createBrainContext);
router.put('/admin/brain-contexts/:id', constructorController.updateBrainContext);
router.delete('/admin/brain-contexts/:id', constructorController.deleteBrainContext);

module.exports = router;
