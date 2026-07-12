const express = require('express');
const router = express.Router();
const { restrictTo } = require('../middlewares/roleMiddleware');
const ctrl = require('../controllers/contentFactoryController');

router.use(restrictTo('admin', 'super_admin'));

// Templates
router.get('/templates', ctrl.listTemplates.bind(ctrl));
router.post('/templates', ctrl.createTemplate.bind(ctrl));
router.get('/templates/:id', ctrl.getTemplate.bind(ctrl));
router.put('/templates/:id', ctrl.updateTemplate.bind(ctrl));
router.delete('/templates/:id', ctrl.deleteTemplate.bind(ctrl));

// Offers
router.get('/offers', ctrl.listOffers.bind(ctrl));
router.post('/offers', ctrl.createOffer.bind(ctrl));
router.get('/offers/:id', ctrl.getOffer.bind(ctrl));
router.put('/offers/:id', ctrl.updateOffer.bind(ctrl));
router.patch('/offers/:id', ctrl.updateOffer.bind(ctrl));
router.post('/offers/:id/generate', ctrl.generateOffer.bind(ctrl));
router.post('/offers/:id/publish', ctrl.publishOffer.bind(ctrl));
router.post('/offers/:id/unpublish', ctrl.unpublishOffer.bind(ctrl));
router.delete('/offers/:id', ctrl.archiveOffer.bind(ctrl));

// AI chat on offer HTML
router.get('/offers/:id/chat/messages', ctrl.listChat.bind(ctrl));
router.post('/offers/:id/chat/messages', ctrl.postChat.bind(ctrl));

module.exports = router;
