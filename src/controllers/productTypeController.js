const productTypeService = require('../services/productTypeService');
const Joi = require('joi');

const productTypeSchema = Joi.object({
    code: Joi.string().min(1).max(50).required()
        .description('Код типа продукта (PDS, IIS, ISZH, etc.)'),
    name: Joi.string().min(1).max(255).required()
        .description('Название типа продукта'),
    description: Joi.string().allow(null, '').optional()
        .description('Описание типа продукта'),
    is_active: Joi.boolean().default(true),
    order_index: Joi.number().integer().default(0)
});

const productTypeUpdateSchema = Joi.object({
    code: Joi.string().min(1).max(50).optional(),
    name: Joi.string().min(1).max(255).optional(),
    description: Joi.string().allow(null, '').optional(),
    is_active: Joi.boolean().optional(),
    order_index: Joi.number().integer().optional()
});

class ProductTypeController {
    async getAll(req, res, next) {
        try {
            const filters = {};
            if (req.query.is_active !== undefined) {
                filters.is_active = req.query.is_active === 'true';
            }
            const productTypes = await productTypeService.getAllProductTypes(filters);
            res.json(productTypes);
        } catch (err) {
            next(err);
        }
    }

    async getById(req, res, next) {
        try {
            const productType = await productTypeService.getProductTypeById(req.params.id);
            if (!productType) return res.status(404).json({ error: 'Product type not found' });
            res.json(productType);
        } catch (err) {
            next(err);
        }
    }

    async create(req, res, next) {
        try {
            const result = productTypeSchema.validate(req.body);
            if (result.error) {
                return res.status(400).json({ error: result.error.details[0].message });
            }

            const newProductType = await productTypeService.createProductType(req.body);
            res.status(201).json(newProductType);
        } catch (err) {
            if (err.status) {
                return res.status(err.status).json({ error: err.message });
            }
            next(err);
        }
    }

    async update(req, res, next) {
        try {
            const result = productTypeUpdateSchema.validate(req.body);
            if (result.error) {
                return res.status(400).json({ error: result.error.details[0].message });
            }

            const updatedProductType = await productTypeService.updateProductType(req.params.id, req.body);
            res.json(updatedProductType);
        } catch (err) {
            if (err.status) {
                return res.status(err.status).json({ error: err.message });
            }
            next(err);
        }
    }

    async delete(req, res, next) {
        try {
            await productTypeService.deleteProductType(req.params.id);
            res.status(204).send();
        } catch (err) {
            if (err.status) {
                return res.status(err.status).json({ error: err.message });
            }
            next(err);
        }
    }
}

module.exports = new ProductTypeController();













