const resolutService = require('../services/resolutService');
const Joi = require('joi');

const productsSchema = Joi.object({
    data: Joi.object().optional()
});

const quoteSchema = Joi.object({
    code: Joi.string().required(),
    parameters: Joi.object().required()
});

class ResolutController {
    resolveProjectId(req) {
        return req.projectId || req.user?.projectId;
    }

    handleResolutError(err, res, next) {
        if (!err || (!err.error && !err.details)) {
            return next(err);
        }

        const status = err.status || 502;
        const details = err.details || {};
        return res.status(status).json({
            ok: false,
            status,
            operation: details.operation || null,
            data: null,
            err: {
                code: details.upstream_err_code || err.error || 'resolut_error',
                message: details.upstream_err_message || err.message || 'Resolut operation failed',
                upstream_status: details.upstream_status || null
            }
        });
    }

    async authorize(req, res, next) {
        try {
            const projectId = this.resolveProjectId(req);
            const result = await resolutService.authorize(projectId);
            res.json(result);
        } catch (err) {
            this.handleResolutError(err, res, next);
        }
    }

    async products(req, res, next) {
        try {
            const validation = productsSchema.validate(req.body || {});
            if (validation.error) {
                return res.status(400).json({
                    error: 'ValidationError',
                    message: validation.error.details[0].message
                });
            }

            const projectId = this.resolveProjectId(req);
            const data = (req.body && req.body.data) ? req.body.data : {};
            const result = await resolutService.products(projectId, data, { userId: req.user?.id });
            res.json(result);
        } catch (err) {
            this.handleResolutError(err, res, next);
        }
    }

    async quote(req, res, next) {
        try {
            const validation = quoteSchema.validate(req.body || {});
            if (validation.error) {
                return res.status(400).json({
                    error: 'ValidationError',
                    message: validation.error.details[0].message
                });
            }

            const projectId = this.resolveProjectId(req);
            const result = await resolutService.quote(projectId, req.body, { userId: req.user?.id });
            res.json(result);
        } catch (err) {
            this.handleResolutError(err, res, next);
        }
    }
}

module.exports = new ResolutController();
