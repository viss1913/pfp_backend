const express = require('express');
const multer = require('multer');
const agentController = require('../controllers/agentController');
const router = express.Router();

const signatureUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter(req, file, cb) {
        const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
        if (ok) return cb(null, true);
        cb(new Error('Only image/jpeg, image/png, image/webp are allowed'));
    },
});

function signatureUploadError(err, req, res, next) {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large (max 8MB)' });
    }
    if (err.message) {
        return res.status(400).json({ error: err.message });
    }
    return next(err);
}

// Publicly accessible with API Key or Admin role (handled in controller)
router.get('/', agentController.getAll);
router.post('/', agentController.create);
router.get(
    '/me/subagents/dashboard',
    agentController.getMySubagentsDashboard.bind(agentController)
);
router.get('/me/subagents', agentController.getMySubagents.bind(agentController));
router.post(
    '/me/partner-id-wizard',
    agentController.completePartnerIdWizard.bind(agentController)
);
router.get('/me/invite-link', agentController.getInviteLink.bind(agentController));
router.post(
    '/me/subagent-invite/send-email',
    agentController.sendSubagentInviteEmail.bind(agentController)
);
router.post(
    '/me/family-office-invite',
    agentController.sendFamilyOfficeInvite.bind(agentController)
);
router.get('/:id/subagents', agentController.getSubagentsById.bind(agentController));
router.post(
    '/:id/signature-upload',
    signatureUpload.single('image'),
    signatureUploadError,
    agentController.uploadSignatureImage.bind(agentController)
);
router.get('/:id', agentController.getById);
router.patch('/:id', agentController.update);

module.exports = router;
