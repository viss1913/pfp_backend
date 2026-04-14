const express = require('express');
const router = express.Router();

const aiB2cController = require('../controllers/aiB2cController');
const authMiddleware = require('../middlewares/authMiddleware');
const tenantMiddleware = require('../middlewares/tenantMiddleware');
const { restrictTo } = require('../middlewares/roleMiddleware');
const multer = require('multer');

// Доступ: агент + админские роли внутри своего проекта
const agentAiMiddleware = [authMiddleware, tenantMiddleware, restrictTo('agent', 'admin', 'super_admin')];

const chatAiContextUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = new Set([
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/msword',
            'text/plain',
            'text/markdown',
            'application/rtf',
            'text/rtf'
        ]);
        const allowedExtensions = ['.pdf', '.docx', '.doc', '.txt', '.md', '.rtf'];
        const ext = (file.originalname || '').toLowerCase();
        const hasAllowedExt = allowedExtensions.some((suffix) => ext.endsWith(suffix));

        if (allowedMimeTypes.has(file.mimetype) || hasAllowedExt) {
            return cb(null, true);
        }
        return cb(new Error('Only PDF, DOC, DOCX, TXT, MD and RTF files are allowed'));
    }
});

function chatAiContextUploadError(err, req, res, next) {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large (max 8MB)' });
    }
    if (err.message) {
        return res.status(400).json({ error: err.message });
    }
    return next(err);
}

// ==================== Brain Contexts (chat_AI) ====================
router.get('/brain-contexts', agentAiMiddleware, aiB2cController.getAiB2cChatAiBrainContexts.bind(aiB2cController));
router.post(
    '/brain-contexts',
    agentAiMiddleware,
    chatAiContextUpload.single('document'),
    chatAiContextUploadError,
    aiB2cController.createAiB2cChatAiBrainContext.bind(aiB2cController)
);
router.put('/brain-contexts/:id', agentAiMiddleware, aiB2cController.updateAiB2cChatAiBrainContext.bind(aiB2cController));
router.delete('/brain-contexts/:id', agentAiMiddleware, aiB2cController.deleteAiB2cChatAiBrainContext.bind(aiB2cController));

// ==================== Stage Contexts (chat_AI) ====================
router.get('/stages', agentAiMiddleware, aiB2cController.getAiB2cChatStages.bind(aiB2cController));
router.post('/stages', agentAiMiddleware, aiB2cController.createAiB2cChatStage.bind(aiB2cController));
router.put('/stages/:id', agentAiMiddleware, aiB2cController.updateAiB2cChatStage.bind(aiB2cController));
router.delete('/stages/:id', agentAiMiddleware, aiB2cController.deleteAiB2cChatStage.bind(aiB2cController));

module.exports = router;

