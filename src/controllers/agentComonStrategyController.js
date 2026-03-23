const Joi = require('joi');
const { agentComonStrategyService, RISK_PROFILES } = require('../services/agentComonStrategyService');

const portfolioItemSchema = Joi.object({
    instrument: Joi.string().trim().min(1).max(255).required(),
    share_percent: Joi.number().required(),
});

const createSchema = Joi.object({
    comon_url: Joi.string().trim().min(1).max(512).required(),
    name: Joi.string().trim().min(1).max(255).required(),
    min_contribution: Joi.number().min(0).allow(null).optional(),
    risk_profile: Joi.string()
        .valid(...RISK_PROFILES)
        .required(),
    description: Joi.string().allow('', null).max(20000).optional(),
    portfolio: Joi.array().items(portfolioItemSchema).length(2).required(),
}).unknown(false);

const patchSchema = Joi.object({
    comon_url: Joi.string().trim().min(1).max(512).optional(),
    name: Joi.string().trim().min(1).max(255).optional(),
    min_contribution: Joi.number().min(0).allow(null).optional(),
    risk_profile: Joi.string()
        .valid(...RISK_PROFILES)
        .optional(),
    description: Joi.string().allow('', null).max(20000).optional(),
    portfolio: Joi.array().items(portfolioItemSchema).length(2).optional(),
})
    .min(1)
    .unknown(false);

function requireAgentId(req, res) {
    const agentId = req.user?.agentId;
    if (agentId == null) {
        res.status(403).json({ error: 'Agent profile required (agentId missing)' });
        return null;
    }
    return agentId;
}

async function list(req, res, next) {
    try {
        const agentId = requireAgentId(req, res);
        if (agentId == null) return;
        const projectId = req.projectId ?? req.user.projectId ?? null;
        const rows = await agentComonStrategyService.list(agentId, projectId);
        res.json({ success: true, data: rows, risk_profiles: RISK_PROFILES });
    } catch (e) {
        next(e);
    }
}

async function getOne(req, res, next) {
    try {
        const agentId = requireAgentId(req, res);
        if (agentId == null) return;
        const projectId = req.projectId ?? req.user.projectId ?? null;
        const row = await agentComonStrategyService.getById(req.params.id, agentId, projectId);
        if (!row) {
            return res.status(404).json({ success: false, error: 'Strategy not found' });
        }
        res.json({ success: true, data: row });
    } catch (e) {
        next(e);
    }
}

async function create(req, res, next) {
    try {
        const agentId = requireAgentId(req, res);
        if (agentId == null) return;
        const { error, value } = createSchema.validate(req.body, { stripUnknown: true });
        if (error) {
            return res.status(400).json({ success: false, error: error.message });
        }
        const projectId = req.projectId ?? req.user.projectId ?? null;
        const row = await agentComonStrategyService.create(agentId, projectId, value);
        res.status(201).json({ success: true, data: row });
    } catch (e) {
        if (e.status === 409) {
            return res.status(409).json({ success: false, error: e.message });
        }
        next(e);
    }
}

async function patch(req, res, next) {
    try {
        const agentId = requireAgentId(req, res);
        if (agentId == null) return;
        const { error, value } = patchSchema.validate(req.body, { stripUnknown: true });
        if (error) {
            return res.status(400).json({ success: false, error: error.message });
        }
        const projectId = req.projectId ?? req.user.projectId ?? null;
        const row = await agentComonStrategyService.update(req.params.id, agentId, projectId, value);
        res.json({ success: true, data: row });
    } catch (e) {
        if (e.status === 404) {
            return res.status(404).json({ success: false, error: e.message });
        }
        if (e.status === 409) {
            return res.status(409).json({ success: false, error: e.message });
        }
        next(e);
    }
}

async function remove(req, res, next) {
    try {
        const agentId = requireAgentId(req, res);
        if (agentId == null) return;
        const projectId = req.projectId ?? req.user.projectId ?? null;
        await agentComonStrategyService.remove(req.params.id, agentId, projectId);
        res.json({ success: true });
    } catch (e) {
        if (e.status === 404) {
            return res.status(404).json({ success: false, error: e.message });
        }
        next(e);
    }
}

async function profitMetrics(req, res, next) {
    try {
        const agentId = requireAgentId(req, res);
        if (agentId == null) return;
        const projectId = req.projectId ?? req.user.projectId ?? null;
        const payload = await agentComonStrategyService.getProfitMetricsForRow(
            req.params.id,
            agentId,
            projectId
        );
        res.json({ success: true, data: payload });
    } catch (e) {
        if (e.status === 404) {
            return res.status(404).json({ success: false, error: e.message });
        }
        if (e.message && String(e.message).includes('Comon strategy profit HTTP')) {
            return res.status(502).json({ success: false, error: e.message });
        }
        next(e);
    }
}

async function profit(req, res, next) {
    try {
        const agentId = requireAgentId(req, res);
        if (agentId == null) return;
        const projectId = req.projectId ?? req.user.projectId ?? null;
        const payload = await agentComonStrategyService.getComonProfitForRow(
            req.params.id,
            agentId,
            projectId
        );
        res.json({ success: true, data: payload });
    } catch (e) {
        if (e.status === 404) {
            return res.status(404).json({ success: false, error: e.message });
        }
        if (e.message && String(e.message).includes('Comon strategy profit HTTP')) {
            return res.status(502).json({ success: false, error: e.message });
        }
        next(e);
    }
}

module.exports = {
    list,
    getOne,
    create,
    patch,
    remove,
    profitMetrics,
    profit,
    RISK_PROFILES,
};
