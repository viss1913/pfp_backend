const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
// const authMiddleware = require('../middlewares/authMiddleware'); // Already applied in index.js for /pfp/ routes? 
// Checking index.js: router.use('/pfp/ai', authMiddleware, ...); NO.
// We need to decide where to mount. Plan said /pfp/ai with authMiddleware in index.js

router.get('/assistants', aiController.listAssistants.bind(aiController));
router.get('/history/:assistant_id', aiController.getHistory.bind(aiController));
router.post('/chat', aiController.chatStream.bind(aiController));
router.post('/chat/stream', aiController.chatStream.bind(aiController));

module.exports = router;
