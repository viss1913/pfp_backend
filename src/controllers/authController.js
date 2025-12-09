const Joi = require('joi');
const authService = require('../services/authService');

// Validation schemas
const loginSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required()
});

const registerSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    name: Joi.string().min(2).max(255).required(),
    agentId: Joi.number().integer().positive().required()
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

    async me(req, res, next) {
        try {
            // Return current user info from token
            res.json({
                id: req.user.id,
                email: req.user.email,
                role: req.user.role,
                agentId: req.user.agentId
            });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new AuthController();
