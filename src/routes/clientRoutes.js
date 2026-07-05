const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');

// Calculator (Stateless)
const authMiddleware = require('../middlewares/authMiddleware');

const tenantMiddleware = require('../middlewares/tenantMiddleware');

// Calculator (Stateless): optional Bearer JWT sets project from agent; else x-project-key (see tenantMiddleware)
router.post(
    '/calculate',
    authMiddleware.optionalAuthMiddleware,
    tenantMiddleware,
    clientController.calculateFirstRun.bind(clientController)
);

router.get(
    '/risk-profile/questionnaire-v2',
    authMiddleware.optionalAuthMiddleware,
    tenantMiddleware,
    clientController.getGuestRiskProfileQuestionnaireV2.bind(clientController)
);

router.post(
    '/risk-profile/evaluate',
    authMiddleware.optionalAuthMiddleware,
    tenantMiddleware,
    clientController.evaluateGuestRiskProfile.bind(clientController)
);

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
