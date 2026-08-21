const express = require('express');
const router = express.Router();
const macroController = require('../controllers/macroController');

// GET /latest и /public-latest — без JWT, см. src/routes/index.js (лендинги FO).
router.get('/history/:slug', macroController.getHistory);

// Ручной запуск (рекомендуется ограничить правами admin в будущем)
router.post('/sync', macroController.triggerSync);

module.exports = router;
