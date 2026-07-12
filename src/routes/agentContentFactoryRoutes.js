const express = require('express');
const router = express.Router();
const { restrictTo } = require('../middlewares/roleMiddleware');
const ctrl = require('../controllers/contentFactoryController');

router.use(restrictTo('agent', 'admin', 'super_admin'));

// Catalog of published offers for agent dashboard
router.get('/offers', ctrl.agentListOffers.bind(ctrl));
router.get('/offers/:id', ctrl.agentGetOffer.bind(ctrl));

// Presentations (decks)
router.get('/presentations', ctrl.listPresentations.bind(ctrl));
router.post('/presentations', ctrl.createPresentation.bind(ctrl));
router.get('/presentations/:id', ctrl.getPresentation.bind(ctrl));
router.patch('/presentations/:id', ctrl.updatePresentation.bind(ctrl));
router.post('/presentations/:id/pdf', ctrl.generatePdf.bind(ctrl));
router.post('/presentations/:id/email-draft', ctrl.emailDraft.bind(ctrl));
router.post('/presentations/:id/send', ctrl.sendPresentation.bind(ctrl));

module.exports = router;
