const express = require('express');
const router = express.Router();
const aiB2cController = require('../controllers/aiB2cController');
const authMiddleware = require('../middlewares/authMiddleware');
const tenantMiddleware = require('../middlewares/tenantMiddleware');
const { restrictTo } = require('../middlewares/roleMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const uploadController = require('../controllers/uploadController');

// Доступ: агент + админские роли внутри своего проекта
const agentAiMiddleware = [authMiddleware, tenantMiddleware, restrictTo('agent', 'admin', 'super_admin')];

// Storage для аватаров AI B2C
const aiB2cAvatarDir = path.join(__dirname, '..', '..', 'uploads', 'ai-b2c-avatars');
if (!fs.existsSync(aiB2cAvatarDir)) {
    fs.mkdirSync(aiB2cAvatarDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, aiB2cAvatarDir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname) || '.png';
        const safeName = `avatar_${Date.now()}${ext}`;
        cb(null, safeName);
    }
});

const imageUpload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    },
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Only image files are allowed'));
        }
        cb(null, true);
    }
});

// Stage Contexts (сценарии/этапы ИИ в проекте агента)
router.get('/flows', agentAiMiddleware, aiB2cController.getAiB2cFlows.bind(aiB2cController));
router.post('/flows', agentAiMiddleware, aiB2cController.createAiB2cFlow.bind(aiB2cController));

router.get('/brain-contexts', agentAiMiddleware, aiB2cController.getAiB2cBrainContexts.bind(aiB2cController));
router.post('/brain-contexts', agentAiMiddleware, aiB2cController.createAiB2cBrainContext.bind(aiB2cController));
router.put('/brain-contexts/:id', agentAiMiddleware, aiB2cController.updateAiB2cBrainContext.bind(aiB2cController));
router.delete('/brain-contexts/:id', agentAiMiddleware, aiB2cController.deleteAiB2cBrainContext.bind(aiB2cController));

// Stage Contexts (сценарии/этапы ИИ в проекте агента)
router.get('/stages', agentAiMiddleware, aiB2cController.getAiB2cStages.bind(aiB2cController));
router.post('/stages', agentAiMiddleware, aiB2cController.createAiB2cStage.bind(aiB2cController));
router.put('/stages/:id', agentAiMiddleware, aiB2cController.updateAiB2cStage.bind(aiB2cController));
router.delete('/stages/:id', agentAiMiddleware, aiB2cController.deleteAiB2cStage.bind(aiB2cController));

// Assistant Settings — агент настраивает вид ассистента внутри своего проекта
router.get('/settings', agentAiMiddleware, aiB2cController.getAiB2cSettings.bind(aiB2cController));
router.put('/settings', agentAiMiddleware, aiB2cController.upsertAiB2cSettings.bind(aiB2cController));

// Avatar upload — отдельный эндпоинт для загрузки файла и получения URL
router.post(
    '/avatar-upload',
    agentAiMiddleware,
    imageUpload.single('image'),
    uploadController.uploadAiB2cAvatar.bind(uploadController)
);

module.exports = router;

