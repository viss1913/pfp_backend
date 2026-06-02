const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');

router.get('/commission-schema/meta', productController.getCommissionSchemaMeta.bind(productController));
router.get('/', productController.getAll);
router.get('/:id', productController.getById);
router.post('/', productController.create);
router.put('/:id', productController.update);
router.delete('/:id', productController.delete);
router.post('/:id/clone', productController.clone);

module.exports = router;
