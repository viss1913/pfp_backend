const Joi = require('joi');
const authService = require('../services/authService');

// Validation schemas
const loginSchema = Joi.object({
    email: Joi.string().email({ tlds: { allow: false } }).required(),
    password: Joi.string().min(6).required(),
    // Допускаем project_key на логине, но дальше его игнорируем.
    project_key: Joi.string().optional()
});

const registerSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    name: Joi.string().min(2).max(255).required(),
    agentId: Joi.number().integer().positive().required()
});

// Client registration schemas (2-step)
const registerClientSchema = Joi.object({
    email: Joi.string().email({ tlds: { allow: false } }).required(),
    name: Joi.string().min(2).max(255).required(),
    project_key: Joi.string().required()
});

const verifyCodeSchema = Joi.object({
    email: Joi.string().email({ tlds: { allow: false } }).required(),
    code: Joi.string().length(6).required(),
    password: Joi.string().min(6).required()
});

// Client registration schema (fast)
const registerFastSchema = Joi.object({
    email: Joi.string().email({ tlds: { allow: false } }).required(),
    password: Joi.string().min(6).required(),
    project_key: Joi.string().required(),
    name: Joi.string().min(2).max(255).optional()
});

// Agent registration step 1 — send code (Resend)
const registerAgentSchema = Joi.object({
    email: Joi.string().email({ tlds: { allow: false } }).required(),
    first_name: Joi.string().max(100).allow('').optional(),
    last_name: Joi.string().max(100).allow('').optional(),
    phone: Joi.string().max(50).allow('').optional(),
    project_key: Joi.string().required(),
    partner_agent_id: Joi.string().max(64).allow('').optional(),
    partner_ref_url: Joi.string().max(2048).allow('').optional(),
    ref: Joi.string().max(128).allow('').optional(),
    utm_source: Joi.string().max(128).allow('').optional(),
    utm_medium: Joi.string().max(128).allow('').optional(),
    utm_campaign: Joi.string().max(128).allow('').optional(),
    utm_content: Joi.string().max(128).allow('').optional(),
    utm_term: Joi.string().max(128).allow('').optional(),
    utm_partner_finam: Joi.string().max(64).allow('').optional(),
});

const verifyAgentRegistrationSchema = Joi.object({
    email: Joi.string().email({ tlds: { allow: false } }).required(),
    code: Joi.string().length(6).required(),
    password: Joi.string().min(6).required(),
});

const registerFamilyOfficeSchema = Joi.object({
    email: Joi.string().email({ tlds: { allow: false } }).required(),
    first_name: Joi.string().max(100).required(),
    last_name: Joi.string().max(100).required(),
    middle_name: Joi.string().max(100).allow('').optional(),
    phone: Joi.string().max(50).required(),
    gender: Joi.string()
        .valid('male', 'female', 'M', 'F', 'мужской', 'женский')
        .required(),
    project_key: Joi.string().required(),
    utm_source: Joi.string().max(128).allow('').optional(),
    utm_medium: Joi.string().max(128).allow('').optional(),
    utm_campaign: Joi.string().max(128).allow('').optional(),
    utm_content: Joi.string().max(128).allow('').optional(),
    utm_term: Joi.string().max(128).allow('').optional(),
    utm_partner_finam: Joi.string().max(64).allow('').optional(),
});

const verifyFamilyOfficeRegistrationSchema = Joi.object({
    email: Joi.string().email({ tlds: { allow: false } }).required(),
    code: Joi.string().length(6).required(),
    password: Joi.string().min(6).required(),
});

const parsePartnerAgentSchema = Joi.object({
    project_key: Joi.string().required(),
    partner_agent_id: Joi.string().max(64).allow('').optional(),
    partner_ref_url: Joi.string().max(2048).allow('').optional(),
});

const activateAgentInviteSchema = Joi.object({
    token: Joi.string().min(16).max(128).required(),
    password: Joi.string().min(6).required(),
});

class AuthController {
    async login(req, res, next) {
        try {
            const validation = loginSchema.validate(req.body);
            if (validation.error) {
                return res.status(400).json({ error: validation.error.details[0].message });
            }

            const { email, password } = req.body;
            const result = await authService.login(email, password);

            res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async register(req, res, next) {
        try {
            const validation = registerSchema.validate(req.body);
            if (validation.error) {
                return res.status(400).json({ error: validation.error.details[0].message });
            }

            const user = await authService.register(req.body);
            res.status(201).json(user);
        } catch (err) {
            next(err);
        }
    }

    /**
     * Step 1: Client registration — send verification code to email
     * POST /auth/register-client
     */
    async registerClient(req, res, next) {
        try {
            const validation = registerClientSchema.validate(req.body);
            if (validation.error) {
                return res.status(400).json({ error: validation.error.details[0].message });
            }

            const result = await authService.initiateClientRegistration(req.body);
            res.json(result);
        } catch (err) {
            next(err);
        }
    }

    /**
     * Step 2: Verify code and create account
     * POST /auth/verify-code
     */
    async verifyCode(req, res, next) {
        try {
            const validation = verifyCodeSchema.validate(req.body);
            if (validation.error) {
                return res.status(400).json({ error: validation.error.details[0].message });
            }

            const result = await authService.verifyAndCreateClient(req.body);
            res.status(201).json(result);
        } catch (err) {
            next(err);
        }
    }

    /**
     * Fast Client registration (1-step)
     * POST /auth/register-fast
     */
    async registerFast(req, res, next) {
        try {
            const validation = registerFastSchema.validate(req.body);
            if (validation.error) {
                return res.status(400).json({ error: validation.error.details[0].message });
            }

            const result = await authService.registerFastClient(req.body);
            res.status(201).json(result);
        } catch (err) {
            next(err);
        }
    }

    /**
     * Agent registration step 1 — send verification code (Resend, noreply@).
     * POST /auth/register-agent
     */
    async registerAgent(req, res, next) {
        try {
            const validation = registerAgentSchema.validate(req.body);
            if (validation.error) {
                return res.status(400).json({ error: validation.error.details[0].message });
            }

            const result = await authService.initiateAgentRegistration(validation.value);
            res.json(result);
        } catch (err) {
            next(err);
        }
    }

    /**
     * Agent registration step 2 — verify code and create account.
     * POST /auth/verify-agent-registration
     */
    async verifyAgentRegistration(req, res, next) {
        try {
            const validation = verifyAgentRegistrationSchema.validate(req.body);
            if (validation.error) {
                return res.status(400).json({ error: validation.error.details[0].message });
            }

            const result = await authService.verifyAndCreateAgent(validation.value);
            res.status(201).json(result);
        } catch (err) {
            next(err);
        }
    }

    /**
     * Family Office self-registration step 1 — send verification code.
     * POST /auth/register-family-office
     */
    async registerFamilyOffice(req, res, next) {
        try {
            const validation = registerFamilyOfficeSchema.validate(req.body);
            if (validation.error) {
                return res.status(400).json({ error: validation.error.details[0].message });
            }

            const result = await authService.initiateFamilyOfficeSelfRegistration(validation.value);
            res.json(result);
        } catch (err) {
            next(err);
        }
    }

    /**
     * Family Office self-registration step 2 — verify code and create account.
     * POST /auth/verify-family-office-registration
     */
    async verifyFamilyOfficeRegistration(req, res, next) {
        try {
            const validation = verifyFamilyOfficeRegistrationSchema.validate(req.body);
            if (validation.error) {
                return res.status(400).json({ error: validation.error.details[0].message });
            }

            const result = await authService.verifyAndCreateFamilyOfficeAgent(validation.value);
            res.status(201).json(result);
        } catch (err) {
            next(err);
        }
    }

    /**
     * POST /auth/parse-partner-agent
     */
    async parsePartnerAgent(req, res, next) {
        try {
            const validation = parsePartnerAgentSchema.validate(req.body);
            if (validation.error) {
                return res.status(400).json({ error: validation.error.details[0].message });
            }

            const projectService = require('../services/projectService');
            const { parsePartnerAgentIdFromInput } = require('../utils/partnerAgentId');
            const { parseProjectSettings, getPartnerAgentIdSettings } = require('../utils/projectSettings');

            const project = await projectService.getProjectByPublicKey(validation.value.project_key);
            if (!project) {
                return res.status(400).json({ error: 'Неверный ключ проекта' });
            }

            const settings = parseProjectSettings(project.settings);
            const partnerAgentId = parsePartnerAgentIdFromInput(validation.value, settings);
            if (!partnerAgentId) {
                return res.status(400).json({ error: 'Не удалось определить ID партнёра' });
            }

            const label = getPartnerAgentIdSettings(settings).label || 'ID партнёра';
            res.json({ partner_agent_id: partnerAgentId, label });
        } catch (err) {
            next(err);
        }
    }

    async previewAgentInvite(req, res, next) {
        try {
            const token = req.query.token;
            if (!token || String(token).trim() === '') {
                return res.status(400).json({ error: 'token is required' });
            }
            const preview = await authService.previewAgentInviteToken(String(token).trim());
            res.json(preview);
        } catch (err) {
            next(err);
        }
    }

    async previewClientReferral(req, res, next) {
        try {
            const ref = req.query.ref;
            const projectKey =
                req.query.project_key ||
                req.headers['x-project-key'] ||
                req.body?.project_key;
            if (!ref || String(ref).trim() === '') {
                return res.status(400).json({ error: 'ref is required' });
            }
            const preview = await authService.previewClientReferral({
                ref: String(ref).trim(),
                project_key: projectKey != null && String(projectKey).trim() !== ''
                    ? String(projectKey).trim()
                    : null,
            });
            res.json(preview);
        } catch (err) {
            next(err);
        }
    }

    async activateAgentInvite(req, res, next) {
        try {
            const validation = activateAgentInviteSchema.validate(req.body);
            if (validation.error) {
                return res.status(400).json({ error: validation.error.details[0].message });
            }

            const result = await authService.activateAgentInvite(validation.value);
            res.status(200).json(result);
        } catch (err) {
            next(err);
        }
    }

    async me(req, res, next) {
        try {
            const response = {
                id: req.user.id,
                uuid: req.user.uuid,
                email: req.user.email,
                role: req.user.role,
                agentId: req.user.agentId,
                projectId: req.user.projectId,
            };

            if (req.user.clientId) {
                response.clientId = req.user.clientId;
            }

            if (req.user.role === 'agent' && req.user.agentId && req.user.projectId) {
                const profile = await authService.getAgentMeProfile(
                    req.user.agentId,
                    req.user.projectId
                );
                if (profile) {
                    Object.assign(response, profile);
                }
            }

            res.json(response);
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new AuthController();

