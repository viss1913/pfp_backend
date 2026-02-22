const express = require('express');
const router = express.Router();
const macroController = require('../controllers/macroController');

// Публичные (в рамках проекта) данные для виджетов и графиков
router.get('/latest', macroController.getLatest);
router.get('/history/:slug', macroController.getHistory);

// Ручной запуск (рекомендуется ограничить правами admin в будущем)
router.post('/sync', macroController.triggerSync);

module.exports = router;
