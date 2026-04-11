const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');

// Calculator (Stateless)
const authMiddleware = require('../middlewares/authMiddleware');

const tenantMiddleware = require('../middlewares/tenantMiddleware');

// Calculator (Stateless)
router.post('/calculate', tenantMiddleware, clientController.calculateFirstRun.bind(clientController));

// Protected Routes
const pfpMiddleware = [authMiddleware, tenantMiddleware];

router.post('/first-run', pfpMiddleware, clientController.firstRun.bind(clientController));
router.post('/tax-planning/calculate', pfpMiddleware, clientController.calculateTaxPlanning.bind(clientController));
router.get('/agent-clients', pfpMiddleware, clientController.listByAgent.bind(clientController));

// Client Management (DB)
router.post('/', pfpMiddleware, clientController.create.bind(clientController));
router.get('/:id', pfpMiddleware, clientController.get.bind(clientController));
router.put('/:id', pfpMiddleware, clientController.update.bind(clientController));
router.post('/:id/recalculate', pfpMiddleware, clientController.recalculate.bind(clientController));

// Goal Management
router.post('/:id/goals', pfpMiddleware, clientController.addGoal.bind(clientController));
router.delete('/:id/goals/:goalId', pfpMiddleware, clientController.deleteGoal.bind(clientController));

module.exports = router;
