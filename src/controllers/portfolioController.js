const portfolioService = require('../services/portfolioService');
const Joi = require('joi');

// Schema для портфеля
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
    classes: Joi.array().items(Joi.number().integer()).optional(), // Массив ID классов
    risk_profiles: Joi.array().items(Joi.object({
        profile_type: Joi.string().valid('CONSERVATIVE', 'BALANCED', 'AGGRESSIVE').required(),

        initial_capital: Joi.array().items(Joi.object({
            product_id: Joi.number().integer().required(),
            share_percent: Joi.number().required(),
            order_index: Joi.number().integer().allow(null)
        })).optional(),
        initial_replenishment: Joi.array().items(Joi.object({
            product_id: Joi.number().integer().required(),
            share_percent: Joi.number().required(),
            order_index: Joi.number().integer().allow(null)
        })).optional()
    })).optional()
});

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
            const userId = req.user.id;
            const result = await portfolioService.createPortfolio(agentId, userId, req.body);
            res.status(201).json(result);
        } catch (err) {
            next(err);
        }
    }

    async update(req, res, next) {
        try {
            const { id } = req.params;
            const agentId = req.user.agentId;
            const userId = req.user.id;
            const isAdmin = req.user.isAdmin;

            const result = await portfolioService.updatePortfolio(id, agentId, userId, isAdmin, req.body);
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
            const userId = req.user.id;

            const result = await portfolioService.clonePortfolio(id, agentId, userId);
            res.status(201).json(result);
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new PortfolioController();
