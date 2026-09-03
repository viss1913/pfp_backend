const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');
const authMiddleware = require('../middlewares/authMiddleware');
const tenantMiddleware = require('../middlewares/tenantMiddleware');
const { restrictTo } = require('../middlewares/roleMiddleware');

// Все роуты ниже — только для ролей agent/admin/super_admin
const agentMiddleware = [authMiddleware, tenantMiddleware, restrictTo('agent', 'admin', 'super_admin')];

// POST /api/pfp/clients/nda/send — NDA без клиента в БД (до first-run); см. также POST /:id/nda/send
router.post('/nda/send', agentMiddleware, clientController.sendNdaStandalone.bind(clientController));

// GET /api/pfp/clients — список клиентов агента с планами из B2C/CRM
router.get('/', agentMiddleware, clientController.listByAgent.bind(clientController));

// PUT /api/pfp/clients/:clientId — редактирование карточки клиента (профиль, семья, активы, кредиты)
router.put('/:id', agentMiddleware, clientController.updateAgentClient.bind(clientController));

// POST /api/pfp/clients/:id/goals — добавить цель и пересчитать план (тот же handler, что POST /api/client/:id/goals)
router.post('/:id/goals', agentMiddleware, clientController.addGoal.bind(clientController));

// DELETE /api/pfp/clients/:id/goals/:goalId — удалить цель и пересчитать план
router.delete('/:id/goals/:goalId', agentMiddleware, clientController.deleteGoal.bind(clientController));

// GET /api/pfp/clients/:clientId/plans — список планов клиента
router.get('/:id/plans', agentMiddleware, clientController.get.bind(clientController));

// POST /api/pfp/clients/:clientId/plans/:planId/take-over — подхватить план клиента агентом
router.post('/:id/plans/:planId/take-over', agentMiddleware, clientController.recalculate.bind(clientController));

// POST /api/pfp/clients/:id/nda/send — NDA PDF на email клиента + base64 в ответе
router.post('/:id/nda/send', agentMiddleware, clientController.sendNda.bind(clientController));

// POST /api/pfp/clients/:id/life-insurance/send-email — письмо с открытием страхования жизни
router.post('/:id/life-insurance/send-email', agentMiddleware, clientController.sendLifeInsuranceOfferEmail.bind(clientController));

// POST /api/pfp/clients/:id/broker-account/send-email — письмо с открытием брокерского счёта Финам
router.post('/:id/broker-account/send-email', agentMiddleware, clientController.sendBrokerAccountOfferEmail.bind(clientController));

module.exports = router;

