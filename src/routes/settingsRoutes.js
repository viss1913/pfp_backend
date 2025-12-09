const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');

router.get('/', settingsController.getAll);
router.get('/:key', settingsController.getByKey);
router.post('/', settingsController.create);
router.put('/:key', settingsController.update);
router.delete('/:key', settingsController.delete);

module.exports = router;
