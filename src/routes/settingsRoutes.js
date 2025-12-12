const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');

// Основные настройки
router.get('/', settingsController.getAll);
router.post('/', settingsController.create);

// Налоговые ставки 2НДФЛ (должны быть ПЕРЕД /:key, чтобы не перехватывались)
router.get('/tax-2ndfl/brackets', settingsController.getAllTaxBrackets);
router.get('/tax-2ndfl/brackets/by-income/:income', settingsController.getTaxBracketByIncome);
router.get('/tax-2ndfl/brackets/:id', settingsController.getTaxBracketById);
router.post('/tax-2ndfl/brackets', settingsController.createTaxBracket);
router.post('/tax-2ndfl/brackets/bulk', settingsController.createTaxBracketsBulk);
router.put('/tax-2ndfl/brackets/:id', settingsController.updateTaxBracket);
router.delete('/tax-2ndfl/brackets/:id', settingsController.deleteTaxBracket);

// Роуты с параметрами должны быть в конце
router.get('/:key', settingsController.getByKey);
router.put('/:key', settingsController.update);
router.delete('/:key', settingsController.delete);

module.exports = router;
