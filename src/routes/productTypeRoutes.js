const express = require('express');
const router = express.Router();
const productTypeController = require('../controllers/productTypeController');

// GET /pfp/product-types - получить все типы продуктов (для выпадающего списка)
router.get('/', productTypeController.getAll);

// GET /pfp/product-types/:id - получить тип продукта по ID
router.get('/:id', productTypeController.getById);

// POST /pfp/product-types - создать новый тип продукта (admin only)
router.post('/', productTypeController.create);

// PUT /pfp/product-types/:id - обновить тип продукта (admin only)
router.put('/:id', productTypeController.update);

// DELETE /pfp/product-types/:id - удалить тип продукта (admin only)
router.delete('/:id', productTypeController.delete);

module.exports = router;















