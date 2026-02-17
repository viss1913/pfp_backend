const express = require('express');
const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

// Public routes (no auth required)
router.post('/login', authController.login);
router.post('/register', authController.register);

// Client registration (public, 2-step with email verification)
router.post('/register-client', authController.registerClient);
router.post('/verify-code', authController.verifyCode);

// Protected routes (auth required)
router.get('/me', authMiddleware, authController.me);

module.exports = router;

