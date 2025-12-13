const productService = require('../services/productService');
const Joi = require('joi');

const productSchema = Joi.object({
    name: Joi.string().required(),
    product_type: Joi.string().required()
        .description('Тип продукта (текст). Например: PDS, IIS, ISZH, NSZH, DEPOSIT, BOND, STOCK, FUND, OTHER'),
    currency: Joi.string().default('RUB'),
    min_term_months: Joi.number().integer().allow(null),
    max_term_months: Joi.number().integer().allow(null),
    min_amount: Joi.number().allow(null),
    max_amount: Joi.number().allow(null),
    yields: Joi.array().items(Joi.object({
        term_from_months: Joi.number().integer().required(),
        term_to_months: Joi.number().integer().required(),
        amount_from: Joi.number().required(),
        amount_to: Joi.number().required(),
        yield_percent: Joi.number().required()
    })).optional()
});

class ProductController {
    async getAll(req, res, next) {
        try {
            const agentId = req.user.agentId;
            const products = await productService.getAllProducts(agentId, req.query);
            res.json(products);
        } catch (err) {
            next(err);
        }
    }

    async getById(req, res, next) {
        try {
            const product = await productService.getProductById(req.params.id);
            if (!product) return res.status(404).json({ error: 'Product not found' });
            res.json(product);
        } catch (err) {
            next(err);
        }
    }

    async create(req, res, next) {
        try {
            const result = productSchema.validate(req.body);
            if (result.error) {
                return res.status(400).json({ error: result.error.details[0].message });
            }

            const agentId = req.user.agentId;
            const newProduct = await productService.createProduct(agentId, req.body);
            res.status(201).json(newProduct);
        } catch (err) {
            next(err);
        }
    }

    async update(req, res, next) {
        try {
            const { id } = req.params;
            const agentId = req.user.agentId;
            const isAdmin = req.user.isAdmin; // Mocked in auth middleware

            const updatedProduct = await productService.updateProduct(id, agentId, isAdmin, req.body);
            res.json(updatedProduct);
        } catch (err) {
            next(err);
        }
    }

    async delete(req, res, next) {
        try {
            const { id } = req.params;
            const agentId = req.user.agentId;
            const isAdmin = req.user.isAdmin;

            await productService.deleteProduct(id, agentId, isAdmin);
            res.status(204).send();
        } catch (err) {
            next(err);
        }
    }

    async clone(req, res, next) {
        try {
            const { id } = req.params;
            const agentId = req.user.agentId;

            const cloned = await productService.cloneProduct(id, agentId);
            res.status(201).json(cloned);
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new ProductController();
