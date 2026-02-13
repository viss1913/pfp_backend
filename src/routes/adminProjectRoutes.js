const express = require('express');
const projectController = require('../controllers/projectController');
const router = express.Router();

router.get('/', projectController.getAll);
router.get('/:id', projectController.getById);
router.post('/', projectController.create);
router.put('/:id', projectController.update);
router.delete('/:id', projectController.suspend);

module.exports = router;
