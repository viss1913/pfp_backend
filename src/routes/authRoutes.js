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

// Client registration (fast, 1-step without email verification)
router.post('/register-fast', authController.registerFast);

// Agent self-registration (2-step, Resend verification code)
router.post('/register-agent', authController.registerAgent);
router.post('/verify-agent-registration', authController.verifyAgentRegistration.bind(authController));

// Family Office self-registration (public site, 2-step with email code)
router.post('/register-family-office', authController.registerFamilyOffice.bind(authController));
router.post(
    '/verify-family-office-registration',
    authController.verifyFamilyOfficeRegistration.bind(authController)
);
router.post('/parse-partner-agent', authController.parsePartnerAgent.bind(authController));
router.get('/agent-invite/preview', authController.previewAgentInvite.bind(authController));
router.get('/client-referral/preview', authController.previewClientReferral.bind(authController));
router.post('/activate-agent-invite', authController.activateAgentInvite.bind(authController));

// Protected routes (auth required)
router.get('/me', authMiddleware, authController.me);

module.exports = router;

