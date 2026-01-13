const express = require('express');
const agentController = require('../controllers/agentController');
const router = express.Router();

// Publicly accessible with API Key or Admin role (handled in controller)
router.get('/', agentController.getAll);
router.post('/', agentController.create);
router.get('/:id', agentController.getById);
router.patch('/:id', agentController.update);

module.exports = router;
