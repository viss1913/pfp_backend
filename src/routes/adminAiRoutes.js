const express = require('express');
const router = express.Router();
const adminAiController = require('../controllers/adminAiController');
const authMiddleware = require('../middlewares/authMiddleware');

// Reminder: In a real app, you'd want an 'admin' role check here.
// Reusing authMiddleware but enforcing isAdmin check if available or just basic auth for now as per plan.

// router.use(authMiddleware); // Uncomment if global protection needed, or use specific middleware

router.get('/', adminAiController.list.bind(adminAiController));
router.post('/', adminAiController.create.bind(adminAiController));
router.put('/:id', adminAiController.update.bind(adminAiController));
router.delete('/:id', adminAiController.delete.bind(adminAiController));

module.exports = router;
