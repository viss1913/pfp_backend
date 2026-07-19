const express = require('express');
const router = express.Router();
const { restrictTo } = require('../middlewares/roleMiddleware');
const ctrl = require('../controllers/contentFactoryController');

router.use(restrictTo('admin', 'super_admin'));

router.get('/health/ide', ctrl.ideHealth.bind(ctrl));

router.get('/templates', ctrl.listTemplates.bind(ctrl));
router.get('/templates/:templateId/preview', ctrl.getTemplatePreview.bind(ctrl));

router.get('/offers', ctrl.listOffers.bind(ctrl));
router.post('/offers', ctrl.createOffer.bind(ctrl));
router.get('/offers/:id', ctrl.getOffer.bind(ctrl));
router.patch('/offers/:id', ctrl.updateOffer.bind(ctrl));
router.put('/offers/:id', ctrl.updateOffer.bind(ctrl));
router.post('/offers/:id/publish', ctrl.publishOffer.bind(ctrl));
router.post('/offers/:id/unpublish', ctrl.unpublishOffer.bind(ctrl));
router.delete('/offers/:id', ctrl.archiveOffer.bind(ctrl));

router.get('/offers/:id/chat/messages', ctrl.listChat.bind(ctrl));
router.post('/offers/:id/chat/messages', ctrl.postChat.bind(ctrl));

router.post('/offers/:id/media', ctrl.uploadMedia.bind(ctrl));
router.get('/offers/:id/media', ctrl.listMedia.bind(ctrl));

module.exports = router;
