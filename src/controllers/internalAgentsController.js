const Joi = require('joi');
const ideAgentSsoService = require('../services/ideAgentSsoService');

const provisionSchema = Joi.object({
    email: Joi.string().email({ tlds: { allow: false } }).required(),
    password: Joi.string().min(6).optional(),
    first_name: Joi.string().max(100).allow('').optional(),
    last_name: Joi.string().max(100).allow('').optional(),
    middle_name: Joi.string().max(100).allow('').optional(),
    phone: Joi.string().max(50).allow('').optional(),
    region: Joi.string().max(100).allow('').optional(),
    website_url: Joi.string().max(2048).allow(null, '').optional(),
    project_key: Joi.string().required(),
    email_verified: Joi.boolean().valid(true).required(),
    source: Joi.string().max(255).optional(),
});

const ssoTicketSchema = Joi.object({
    email: Joi.string().email({ tlds: { allow: false } }).required(),
    project_key: Joi.string().required(),
    return_path: Joi.string().max(255).optional(),
});

class InternalAgentsController {
    /**
     * POST /api/internal/agents/provision
     */
    async provision(req, res, next) {
        try {
            const validation = provisionSchema.validate(req.body);
            if (validation.error) {
                return res.status(400).json({ error: validation.error.details[0].message });
            }

            const result = await ideAgentSsoService.provisionAgent(validation.value);
            res.json(result);
        } catch (err) {
            next(err);
        }
    }

    /**
     * POST /api/internal/agents/sso-ticket
     */
    async createSsoTicket(req, res, next) {
        try {
            const validation = ssoTicketSchema.validate(req.body);
            if (validation.error) {
                return res.status(400).json({ error: validation.error.details[0].message });
            }

            const result = await ideAgentSsoService.createSsoTicket(validation.value);
            res.json(result);
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new InternalAgentsController();
