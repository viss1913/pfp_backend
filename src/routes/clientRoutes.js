const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');

// Calculator (Stateless)
router.post('/calculate', clientController.calculateFirstRun.bind(clientController));
router.post('/first-run', clientController.firstRun.bind(clientController));

// Client Management (DB)
router.post('/', clientController.create.bind(clientController));
router.get('/:id', clientController.get.bind(clientController));
router.put('/:id', clientController.update.bind(clientController));

module.exports = router;
