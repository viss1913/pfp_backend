const portfolioService = require('../services/portfolioService');
const Joi = require('joi');

// Schema for risk profile instrument (used in both old and new formats)
const instrumentSchema = Joi.object({
    product_id: Joi.number().integer().required(),
    share_percent: Joi.number().required(),
    order_index: Joi.number().integer().allow(null).optional()
});

// Schema for risk profile - supports both old format (initial_capital/initial_replenishment) 
// and new format (instruments with bucket_type)
const riskProfileSchema = Joi.object({
    profile_type: Joi.string().valid(
        'CONSERVATIVE',
        'MODERATELY_CONSERVATIVE',
        'BALANCED',
        'MODERATELY_AGGRESSIVE',
        'AGGRESSIVE'
    ).required(),
    potential_yield_percent: Joi.number().allow(null).optional(),
    description: Joi.string().allow(null, '').optional(),
    explanation: Joi.string().allow(null, '').optional(),
    // New format: instruments with bucket_type
    instruments: Joi.array().items(Joi.object({
        product_id: Joi.number().integer().required(),
        bucket_type: Joi.string().valid('INITIAL_CAPITAL', 'TOP_UP').allow(null),
        share_percent: Joi.number().required(),
        order_index: Joi.number().integer().allow(null).optional()
    }).unknown(true)).optional(), // Allow extra fields like id, portfolio_risk_profile_id from GET response
    // Old format: initial_capital and initial_replenishment (or top_up)
    initial_capital: Joi.array().items(instrumentSchema).optional(),
    initial_replenishment: Joi.array().items(instrumentSchema).optional(),
    top_up: Joi.array().items(instrumentSchema).optional() // Legacy alias for initial_replenishment
}).unknown(false); // Don't allow unknown fields in risk profile

// Simplified Schema for create - supports both old and new formats
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
    classes: Joi.alternatives().try(
        Joi.array().items(Joi.number().integer()), // Array of IDs: [1, 2, 3]
        Joi.array().items(Joi.object({ id: Joi.number().integer().required() }).unknown(true)) // Array of objects: [{id: 1}, {id: 2}]
    ).optional(), // Class IDs (as numbers or objects with id)
    riskProfiles: Joi.array().items(riskProfileSchema).optional(),
    risk_profiles: Joi.array().items(riskProfileSchema).optional()
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
    classes: Joi.alternatives().try(
        Joi.array().items(Joi.number().integer()), // Array of IDs: [1, 2, 3]
        Joi.array().items(Joi.object({ id: Joi.number().integer().required() }).unknown(true)) // Array of objects: [{id: 1}, {id: 2}]
    ).optional(), // Class IDs (as numbers or objects with id)
    riskProfiles: Joi.array().items(riskProfileSchema).optional(),
    risk_profiles: Joi.array().items(riskProfileSchema).optional()
}).unknown(true); // Allow additional fields that might be sent by frontend

class PortfolioController {
    async getAll(req, res, next) {
        try {
            const projectId = req.projectId || req.user?.projectId;
            const result = await portfolioService.getAllPortfolios(projectId, req.query);
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
            const projectId = req.projectId || req.user?.projectId;
            const result = await portfolioService.getPortfolioById(req.params.id, projectId);
            if (!result) return res.status(404).json({ error: 'Portfolio not found' });
            res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async create(req, res, next) {
        try {
            const validation = portfolioSchema.validate(req.body, { abortEarly: false });
            if (validation.error) {
                return res.status(400).json({
                    error: 'Validation error',
                    message: validation.error.details[0].message,
                    details: validation.error.details.map(d => ({
                        field: d.path.join('.'),
                        message: d.message
                    }))
                });
            }

            // Normalize field names: convert snake_case to camelCase
            const normalizedData = { ...req.body };
            if (normalizedData.risk_profiles !== undefined && normalizedData.riskProfiles === undefined) {
                normalizedData.riskProfiles = normalizedData.risk_profiles;
                delete normalizedData.risk_profiles;
            }

            // Normalize classes: if it's an array of objects, extract IDs
            if (normalizedData.classes !== undefined && Array.isArray(normalizedData.classes)) {
                if (normalizedData.classes.length > 0 && typeof normalizedData.classes[0] === 'object' && normalizedData.classes[0] !== null) {
                    normalizedData.classes = normalizedData.classes.map(c => typeof c === 'object' && c !== null ? c.id : c).filter(id => id !== undefined && id !== null);
                }
            }

            // Convert old format to new format
            if (normalizedData.riskProfiles) {
                normalizedData.riskProfiles = normalizedData.riskProfiles.map(profile => {
                    if (profile.instruments !== undefined) return profile;
                    const instruments = [];
                    if (profile.initial_capital && Array.isArray(profile.initial_capital)) {
                        profile.initial_capital.forEach(item => instruments.push({ ...item, bucket_type: 'INITIAL_CAPITAL' }));
                    }
                    const replenishment = profile.initial_replenishment || profile.top_up;
                    if (replenishment && Array.isArray(replenishment)) {
                        replenishment.forEach(item => instruments.push({ ...item, bucket_type: 'TOP_UP' }));
                    }
                    const { initial_capital, initial_replenishment, top_up, ...rest } = profile;
                    return { ...rest, instruments: instruments.length > 0 ? instruments : undefined };
                });
            }

            const agentId = req.user.agentId;
            const projectId = req.projectId || req.user?.projectId;
            const result = await portfolioService.createPortfolio(agentId, projectId, normalizedData);
            res.status(201).json(result);
        } catch (err) {
            next(err);
        }
    }

    async update(req, res, next) {
        try {
            // Log incoming request for debugging
            console.log('=== Portfolio Update Request ===');
            console.log('Portfolio ID:', req.params.id);
            console.log('Request body keys:', Object.keys(req.body));
            console.log('Has classes:', req.body.classes !== undefined);
            console.log('Classes value:', req.body.classes);
            console.log('Has riskProfiles:', req.body.riskProfiles !== undefined);
            console.log('Has risk_profiles:', req.body.risk_profiles !== undefined);
            if (req.body.riskProfiles) {
                console.log('riskProfiles length:', req.body.riskProfiles?.length);
            }
            if (req.body.risk_profiles) {
                console.log('risk_profiles length:', req.body.risk_profiles?.length);
            }

            const validation = portfolioUpdateSchema.validate(req.body, { abortEarly: false });
            if (validation.error) {
                console.error('Validation errors:', validation.error.details);
                return res.status(400).json({
                    error: 'Validation error',
                    message: validation.error.details[0].message,
                    details: validation.error.details.map(d => ({
                        field: d.path.join('.'),
                        message: d.message
                    }))
                });
            }

            // Normalize field names: convert snake_case to camelCase
            const normalizedData = { ...req.body };
            if (normalizedData.risk_profiles !== undefined && normalizedData.riskProfiles === undefined) {
                normalizedData.riskProfiles = normalizedData.risk_profiles;
                delete normalizedData.risk_profiles;
            }

            // Normalize classes: if it's an array of objects, extract IDs
            if (normalizedData.classes !== undefined && Array.isArray(normalizedData.classes)) {
                if (normalizedData.classes.length > 0 && typeof normalizedData.classes[0] === 'object' && normalizedData.classes[0] !== null) {
                    // It's an array of objects, extract IDs
                    normalizedData.classes = normalizedData.classes.map(c => typeof c === 'object' && c !== null ? c.id : c).filter(id => id !== undefined && id !== null);
                    console.log('Normalized classes from objects to IDs:', normalizedData.classes);
                }
                // If it's already an array of numbers, keep it as is
            }

            // Convert old format (initial_capital/initial_replenishment) to new format (instruments)
            if (normalizedData.riskProfiles) {
                normalizedData.riskProfiles = normalizedData.riskProfiles.map(profile => {
                    // If already in new format (has instruments), use it
                    if (profile.instruments !== undefined) {
                        return profile;
                    }

                    // Convert old format to new format
                    const instruments = [];

                    // Convert initial_capital
                    if (profile.initial_capital && Array.isArray(profile.initial_capital)) {
                        profile.initial_capital.forEach(item => {
                            instruments.push({
                                ...item,
                                bucket_type: 'INITIAL_CAPITAL'
                            });
                        });
                    }

                    // Convert initial_replenishment or top_up (legacy)
                    const replenishment = profile.initial_replenishment || profile.top_up;
                    if (replenishment && Array.isArray(replenishment)) {
                        replenishment.forEach(item => {
                            instruments.push({
                                ...item,
                                bucket_type: 'TOP_UP'
                            });
                        });
                    }

                    // Return profile with converted instruments
                    const { initial_capital, initial_replenishment, top_up, ...rest } = profile;
                    return {
                        ...rest,
                        instruments: instruments.length > 0 ? instruments : undefined
                    };
                });
            }

            const { id } = req.params;
            const agentId = req.user.agentId;
            const projectId = req.projectId || req.user?.projectId;
            const isAdmin = ['admin', 'super_admin'].includes(req.user.role);

            const result = await portfolioService.updatePortfolio(id, agentId, projectId, isAdmin, normalizedData);
            res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async delete(req, res, next) {
        try {
            const { id } = req.params;
            const agentId = req.user.agentId;
            const projectId = req.user.projectId || req.projectId;
            const isAdmin = ['admin', 'super_admin'].includes(req.user.role);

            await portfolioService.deletePortfolio(id, agentId, projectId, isAdmin);
            res.status(204).send();
        } catch (err) {
            next(err);
        }
    }

    async clone(req, res, next) {
        try {
            const { id } = req.params;
            const agentId = req.user.agentId;
            const projectId = req.user.projectId || req.projectId;

            const result = await portfolioService.clonePortfolio(id, agentId, projectId);
            res.status(201).json(result);
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new PortfolioController();
