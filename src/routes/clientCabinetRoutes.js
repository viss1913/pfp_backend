const express = require('express');
const router = express.Router();
const clientCabinetController = require('../controllers/clientCabinetController');
const { restrictTo } = require('../middlewares/roleMiddleware');

// All routes here require 'client' role
router.use(restrictTo('client'));

// GET /my/plan — Get my financial plan
router.get('/plan', clientCabinetController.getMyPlan.bind(clientCabinetController));

// POST /my/plan/first-run — Create/update my financial plan
router.post('/plan/first-run', clientCabinetController.createMyPlan.bind(clientCabinetController));

// POST /my/plan/:goalId/recalculate — Recalculate a specific goal
router.post('/plan/:goalId/recalculate', clientCabinetController.recalculateGoal.bind(clientCabinetController));

module.exports = router;
