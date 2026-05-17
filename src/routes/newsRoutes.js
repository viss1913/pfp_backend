const express = require('express');
const router = express.Router();
const newsController = require('../controllers/newsController');

router.get('/feed', newsController.getFeed);
router.post('/:id/read', newsController.markRead);
router.post('/sync', newsController.triggerSync);

module.exports = router;
