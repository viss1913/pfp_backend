const productService = require('../services/productService');
const productTypeService = require('../services/productTypeService');
const Joi = require('joi');

const productLineSchema = Joi.object({
    min_term_months: Joi.number().integer().optional(),
    max_term_months: Joi.number().integer().optional(),
    term_from_months: Joi.number().integer().optional(),
    term_to_months: Joi.number().integer().optional(),
    min_amount: Joi.number().optional(),
    max_amount: Joi.number().optional(),
    amount_from: Joi.number().optional(),
    amount_to: Joi.number().optional(),
    yield_percent: Joi.number().allow(null).optional(),
    risk_name: Joi.string().allow(null, '').optional(),
    age_from: Joi.number().integer().allow(null).optional(),
    age_to: Joi.number().integer().allow(null).optional(),
    payment_ratio: Joi.number().allow(null).optional()
});

const productSchema = Joi.object({
    name: Joi.string().required(),
    product_type: Joi.string().min(1).required()
        .description('Код типа продукта (должен существовать в справочнике типов продуктов). Получить список: GET /api/pfp/product-types'),
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
    })).optional(),
    lines: Joi.alternatives().try(
        Joi.array().items(productLineSchema),
        Joi.string(),
        Joi.object()
    ).optional(),
    resolut_pfp_code: Joi.string().max(64).allow(null, '').optional()
        .description('Код продукта PFP Resolut (products), только для проекта RESOLUT_PROJECT_ID'),
    resolut_quote_p_type: Joi.number().integer().valid(0, 1, 2, 4, 12).allow(null).optional()
        .description('Периодичность взноса для quote; null — из env RESOLUT_PORTFOLIO_QUOTE_PTYPE или 0')
}).unknown(true);

class ProductController {
    async getAll(req, res, next) {
        try {
            const projectId = req.projectId || req.user?.projectId;
            const products = await productService.getAllProducts(projectId, req.query);
            res.json(products);
        } catch (err) {
            next(err);
        }
    }

    async getById(req, res, next) {
        try {
            const projectId = req.projectId || req.user?.projectId;
            const product = await productService.getProductById(req.params.id, projectId);
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

            // Проверяем существование типа продукта
            const productType = await productTypeService.getProductTypeByCode(req.body.product_type);
            if (!productType) {
                return res.status(400).json({ error: `Product type "${req.body.product_type}" not found.` });
            }

            const agentId = req.user.agentId;
            const projectId = req.projectId || req.user?.projectId;
            const newProduct = await productService.createProduct(agentId, projectId, req.body);
            res.status(201).json(newProduct);
        } catch (err) {
            next(err);
        }
    }

    async update(req, res, next) {
        try {
            const { id } = req.params;
            const agentId = req.user.agentId;
            const projectId = req.projectId || req.user?.projectId;
            const isAdmin = req.user.isAdmin;

            const updatedProduct = await productService.updateProduct(id, agentId, projectId, isAdmin, req.body);
            res.json(updatedProduct);
        } catch (err) {
            next(err);
        }
    }

    async delete(req, res, next) {
        try {
            const { id } = req.params;
            const agentId = req.user.agentId;
            const projectId = req.projectId || req.user?.projectId;
            const isAdmin = req.user.isAdmin;

            await productService.deleteProduct(id, agentId, projectId, isAdmin);
            res.status(204).send();
        } catch (err) {
            next(err);
        }
    }

    async clone(req, res, next) {
        try {
            const { id } = req.params;
            const agentId = req.user.agentId;
            const projectId = req.projectId || req.user?.projectId;

            const cloned = await productService.cloneProduct(id, agentId, projectId);
            res.status(201).json(cloned);
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new ProductController();
