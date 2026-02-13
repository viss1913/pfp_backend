const express = require('express');
const adminUserController = require('../controllers/adminUserController');
const { restrictTo } = require('../middlewares/roleMiddleware');
const router = express.Router();

// Only super_admin can manage users
router.use(restrictTo('super_admin'));

router.get('/', adminUserController.getAllUsers);
router.post('/', adminUserController.createUser);
router.put('/:id', adminUserController.updateUser);

module.exports = router;
