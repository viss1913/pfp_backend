const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');
const authMiddleware = require('../middlewares/authMiddleware');
const tenantMiddleware = require('../middlewares/tenantMiddleware');
const { restrictTo } = require('../middlewares/roleMiddleware');

// Все роуты ниже — только для ролей agent/admin/super_admin
const agentMiddleware = [authMiddleware, tenantMiddleware, restrictTo('agent', 'admin', 'super_admin')];

// GET /api/pfp/clients — список клиентов агента с планами из B2C/CRM
router.get('/', agentMiddleware, clientController.listByAgent.bind(clientController));

// GET /api/pfp/clients/:clientId/plans — список планов клиента
router.get('/:id/plans', agentMiddleware, clientController.get.bind(clientController));

// POST /api/pfp/clients/:clientId/plans/:planId/take-over — подхватить план клиента агентом
router.post('/:id/plans/:planId/take-over', agentMiddleware, clientController.recalculate.bind(clientController));

// POST /api/pfp/clients/:id/nda/send — NDA PDF на email клиента + base64 в ответе
router.post('/:id/nda/send', agentMiddleware, clientController.sendNda.bind(clientController));

module.exports = router;

