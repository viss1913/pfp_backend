const express = require('express');
const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

// Public routes (no auth required)
router.post('/login', authController.login);
router.post('/register', authController.register);

// Protected routes (auth required)
router.get('/me', authMiddleware, authController.me);

module.exports = router;
