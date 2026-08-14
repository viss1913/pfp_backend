const express = require('express');
const internalAgentsController = require('../controllers/internalAgentsController');
const pfpIdeServiceKeyAuthMiddleware = require('../middlewares/pfpIdeServiceKeyAuthMiddleware');

const router = express.Router();

router.use(pfpIdeServiceKeyAuthMiddleware);

router.post('/provision', internalAgentsController.provision.bind(internalAgentsController));
router.post('/sso-ticket', internalAgentsController.createSsoTicket.bind(internalAgentsController));

module.exports = router;
