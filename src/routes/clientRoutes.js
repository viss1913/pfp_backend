const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');

// Calculator (Stateless)
const authMiddleware = require('../middlewares/authMiddleware');

// Calculator (Stateless)
router.post('/calculate', clientController.calculateFirstRun.bind(clientController));

// Protected Routes
router.post('/first-run', authMiddleware, clientController.firstRun.bind(clientController));
router.get('/agent-clients', authMiddleware, clientController.listByAgent.bind(clientController));

// Client Management (DB)
// Assuming standard CRUD might need protection too, but sticking to plan
router.post('/', authMiddleware, clientController.create.bind(clientController));
router.get('/:id', authMiddleware, clientController.get.bind(clientController)); // Usually should check agent ownership
router.put('/:id', authMiddleware, clientController.update.bind(clientController));

module.exports = router;
