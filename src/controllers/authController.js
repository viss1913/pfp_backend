const Joi = require('joi');
const authService = require('../services/authService');

// Validation schemas
const loginSchema = Joi.object({
    email: Joi.string().email({ tlds: { allow: false } }).required(),
    password: Joi.string().min(6).required()
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

    async me(req, res, next) {
        try {
            const response = {
                id: req.user.id,
                uuid: req.user.uuid,
                email: req.user.email,
                role: req.user.role,
                agentId: req.user.agentId,
                projectId: req.user.projectId
            };

            // Add clientId for client role
            if (req.user.clientId) {
                response.clientId = req.user.clientId;
            }

            res.json(response);
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new AuthController();

