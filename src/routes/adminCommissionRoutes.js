const express = require('express');
const adminCommissionController = require('../controllers/adminCommissionController');
const { restrictTo } = require('../middlewares/roleMiddleware');

const router = express.Router();

router.use(restrictTo('admin', 'super_admin'));

router.get('/events', adminCommissionController.listEvents.bind(adminCommissionController));
router.post('/events', adminCommissionController.createEvent.bind(adminCommissionController));
router.get('/accruals', adminCommissionController.listAccruals.bind(adminCommissionController));
router.patch('/accruals/:id', adminCommissionController.patchAccrual.bind(adminCommissionController));

module.exports = router;
