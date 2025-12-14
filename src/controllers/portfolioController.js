const portfolioService = require('../services/portfolioService');
const Joi = require('joi');

// Simplified Schema for create
const portfolioSchema = Joi.object({
    name: Joi.string().required(),
    currency: Joi.string().default('RUB'),
    amount_from: Joi.number().required(),
    amount_to: Joi.number().required(),
    term_from_months: Joi.number().integer().required(),
    term_to_months: Joi.number().integer().required(),
    age_from: Joi.number().integer().allow(null),
    age_to: Joi.number().integer().allow(null),
    investor_type: Joi.string().allow(null),
    gender: Joi.string().allow(null),
    classes: Joi.array().items(Joi.number().integer()).optional(), // Class IDs
    riskProfiles: Joi.array().items(Joi.object({
        profile_type: Joi.string().valid('CONSERVATIVE', 'BALANCED', 'AGGRESSIVE').required(),
        potential_yield_percent: Joi.number().allow(null),
        instruments: Joi.array().items(Joi.object({
            product_id: Joi.number().integer().required(),
            bucket_type: Joi.string().valid('INITIAL_CAPITAL', 'TOP_UP').allow(null),
            share_percent: Joi.number().required(),
            order_index: Joi.number().integer().allow(null)
        })).optional()
    })).optional()
});

// Schema for update (all fields optional for partial updates)
// Support both camelCase (riskProfiles) and snake_case (risk_profiles)
const portfolioUpdateSchema = Joi.object({
    name: Joi.string().optional(),
    currency: Joi.string().optional(),
    amount_from: Joi.number().optional(),
    amount_to: Joi.number().optional(),
    term_from_months: Joi.number().integer().optional(),
    term_to_months: Joi.number().integer().optional(),
    age_from: Joi.number().integer().allow(null).optional(),
    age_to: Joi.number().integer().allow(null).optional(),
    investor_type: Joi.string().allow(null).optional(),
    gender: Joi.string().allow(null).optional(),
    classes: Joi.array().items(Joi.number().integer()).optional(), // Class IDs
    riskProfiles: Joi.array().items(Joi.object({
        profile_type: Joi.string().valid('CONSERVATIVE', 'BALANCED', 'AGGRESSIVE').required(),
        potential_yield_percent: Joi.number().allow(null),
        instruments: Joi.array().items(Joi.object({
            product_id: Joi.number().integer().required(),
            bucket_type: Joi.string().valid('INITIAL_CAPITAL', 'TOP_UP').allow(null),
            share_percent: Joi.number().required(),
            order_index: Joi.number().integer().allow(null)
        })).optional()
    })).optional(),
    risk_profiles: Joi.array().items(Joi.object({
        profile_type: Joi.string().valid('CONSERVATIVE', 'BALANCED', 'AGGRESSIVE').required(),
        potential_yield_percent: Joi.number().allow(null),
        instruments: Joi.array().items(Joi.object({
            product_id: Joi.number().integer().required(),
            bucket_type: Joi.string().valid('INITIAL_CAPITAL', 'TOP_UP').allow(null),
            share_percent: Joi.number().required(),
            order_index: Joi.number().integer().allow(null)
        })).optional()
    })).optional()
}).unknown(true); // Allow additional fields that might be sent by frontend

class PortfolioController {
    async getAll(req, res, next) {
        try {
            const agentId = req.user.agentId;
            const result = await portfolioService.getAllPortfolios(agentId, req.query);
            res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async getClasses(req, res, next) {
        try {
            const result = await portfolioService.getPortfolioClasses();
            res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async getById(req, res, next) {
        try {
            const result = await portfolioService.getPortfolioById(req.params.id);
            if (!result) return res.status(404).json({ error: 'Portfolio not found' });
            res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async create(req, res, next) {
        try {
            const validation = portfolioSchema.validate(req.body);
            if (validation.error) return res.status(400).json({ error: validation.error.details[0].message });

            const agentId = req.user.agentId;
            const result = await portfolioService.createPortfolio(agentId, req.body);
            res.status(201).json(result);
        } catch (err) {
            next(err);
        }
    }

    async update(req, res, next) {
        try {
            const validation = portfolioUpdateSchema.validate(req.body);
            if (validation.error) {
                return res.status(400).json({ error: validation.error.details[0].message });
            }

            // Normalize field names: convert snake_case to camelCase
            const normalizedData = { ...req.body };
            if (normalizedData.risk_profiles !== undefined && normalizedData.riskProfiles === undefined) {
                normalizedData.riskProfiles = normalizedData.risk_profiles;
                delete normalizedData.risk_profiles;
            }

            const { id } = req.params;
            const agentId = req.user.agentId;
            const isAdmin = req.user.isAdmin;

            const result = await portfolioService.updatePortfolio(id, agentId, isAdmin, normalizedData);
            res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async delete(req, res, next) {
        try {
            const { id } = req.params;
            const agentId = req.user.agentId;
            const isAdmin = req.user.isAdmin;

            await portfolioService.deletePortfolio(id, agentId, isAdmin);
            res.status(204).send();
        } catch (err) {
            next(err);
        }
    }

    async clone(req, res, next) {
        try {
            const { id } = req.params;
            const agentId = req.user.agentId;

            const result = await portfolioService.clonePortfolio(id, agentId);
            res.status(201).json(result);
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new PortfolioController();
