const resolutService = require('../services/resolutService');
const resolutPublishService = require('../services/resolutPublishService');
const resolutQuoteLineSuggestService = require('../services/resolutQuoteLineSuggestService');
const resolutPlanQuotesService = require('../services/resolutPlanQuotesService');
const Joi = require('joi');

const productsSchema = Joi.object({
    data: Joi.object().optional()
});

const quoteSchema = Joi.object({
    code: Joi.string().required(),
    parameters: Joi.object().required()
});

const portfolioSchema = Joi.object({
    quotes: Joi.array()
        .items(
            Joi.object({
                code: Joi.string().required(),
                parameters: Joi.object().required()
            })
        )
        .min(1)
        .required(),
    client: Joi.object().required()
});

const clientPostSchema = Joi.object({
    code: Joi.alternatives().try(Joi.string(), Joi.number()).optional(),
    lastName: Joi.string().min(2).max(40).optional(),
    firstName: Joi.string().min(2).max(40).optional(),
    middleName: Joi.string().min(2).max(40).allow('').optional(),
    dob: Joi.string().optional(),
    sex: Joi.string().valid('male', 'female').optional(),
    phone: Joi.string().optional(),
    email: Joi.string().email().optional()
}).custom((value, helpers) => {
    const hasCode = value.code !== undefined && value.code !== null && String(value.code).trim().length > 0;
    const requiredCreate = ['lastName', 'firstName', 'dob', 'sex', 'phone', 'email'];
    if (!hasCode) {
        for (const k of requiredCreate) {
            if (value[k] === undefined || value[k] === null || value[k] === '') {
                return helpers.message(`"${k}" is required for client create`);
            }
        }
    } else {
        const extraKeys = Object.keys(value).filter((k) => k !== 'code');
        if (extraKeys.length === 0) {
            return helpers.message('Provide fields to update with code, or use GET /api/pfp/resolut/client?code= for fetch');
        }
    }
    return value;
});

const publishLineSchema = Joi.object({
    line_id: Joi.string().optional(),
    product_id: Joi.number().integer().positive().optional(),
    code: Joi.string().optional(),
    parameters: Joi.object().required()
});

const publishPreviewSchema = Joi.object({
    client_id: Joi.number().integer().positive().required(),
    quotes: Joi.array().items(publishLineSchema).required()
});

const publishSchema = Joi.object({
    client_id: Joi.number().integer().positive().required(),
    quotes: Joi.array().items(publishLineSchema).required(),
    resolut_client: Joi.object({
        lastName: Joi.string().min(2).max(40).optional(),
        firstName: Joi.string().min(2).max(40).optional(),
        middleName: Joi.string().allow('').optional(),
        dob: Joi.string().optional(),
        sex: Joi.string().valid('male', 'female').optional(),
        phone: Joi.string().optional(),
        email: Joi.string().email().optional()
    }).allow(null).optional()
});

const suggestQuoteLineSchema = Joi.object({
    client_id: Joi.number().integer().positive().required(),
    product_id: Joi.number().integer().positive().required(),
    term_months: Joi.number().integer().min(1).default(120),
    valuation_type: Joi.string().valid('byLimit', 'byPremium').default('byLimit'),
    amount: Joi.number().positive().required(),
    p_type: Joi.number().integer().valid(0, 1, 2, 4, 12).optional()
});

const resolutClientPatchSchema = Joi.object({
    lastName: Joi.string().min(2).max(40).optional(),
    firstName: Joi.string().min(2).max(40).optional(),
    middleName: Joi.string().allow('').optional(),
    dob: Joi.string().optional(),
    sex: Joi.string().valid('male', 'female').optional(),
    phone: Joi.string().optional(),
    email: Joi.string().email().optional()
}).allow(null);

const planQuotesBodySchema = Joi.object({
    client_id: Joi.number().integer().positive().required(),
    term_months: Joi.number().integer().min(1).optional(),
    include_monthly_flow: Joi.boolean().optional(),
    quote_patches: Joi.array().items(Joi.object({
        product_id: Joi.number().integer().positive().required(),
        code: Joi.string().optional(),
        parameters: Joi.object().optional()
    })).optional()
});

const publishFromPlanSchema = planQuotesBodySchema.keys({
    resolut_client: resolutClientPatchSchema.optional()
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

    handlePublishError(err, res, next) {
        if (!err) return next(err);
        if (err.status || err.error) {
            const status = err.status || 400;
            return res.status(status).json({
                success: false,
                error: {
                    code: err.error || 'RESOLUT_PUBLISH_ERROR',
                    message: err.message || 'Resolut publish failed'
                },
                details: err.details || null
            });
        }
        return next(err);
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

    async portfolio(req, res, next) {
        try {
            const validation = portfolioSchema.validate(req.body || {});
            if (validation.error) {
                return res.status(400).json({
                    error: 'ValidationError',
                    message: validation.error.details[0].message
                });
            }

            const projectId = this.resolveProjectId(req);
            const result = await resolutService.portfolio(projectId, validation.value, { userId: req.user?.id });
            res.json(result);
        } catch (err) {
            this.handleResolutError(err, res, next);
        }
    }

    async client(req, res, next) {
        try {
            const validation = clientPostSchema.validate(req.body || {});
            if (validation.error) {
                return res.status(400).json({
                    error: 'ValidationError',
                    message: validation.error.details[0].message
                });
            }

            const projectId = this.resolveProjectId(req);
            const result = await resolutService.client(projectId, validation.value, { userId: req.user?.id });
            res.json(result);
        } catch (err) {
            this.handleResolutError(err, res, next);
        }
    }

    async clientFetch(req, res, next) {
        try {
            const code = req.query.code;
            if (code === undefined || code === null || String(code).trim() === '') {
                return res.status(400).json({
                    error: 'ValidationError',
                    message: '"code" query parameter is required'
                });
            }

            const projectId = this.resolveProjectId(req);
            const result = await resolutService.clientFetch(projectId, String(code).trim(), { userId: req.user?.id });
            res.json(result);
        } catch (err) {
            this.handleResolutError(err, res, next);
        }
    }

    async link(req, res, next) {
        try {
            const projectId = this.resolveProjectId(req);
            const result = await resolutService.link(projectId, { userId: req.user?.id });
            res.json(result);
        } catch (err) {
            this.handleResolutError(err, res, next);
        }
    }

    async publishPreview(req, res, next) {
        try {
            const validation = publishPreviewSchema.validate(req.body || {});
            if (validation.error) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: validation.error.details[0].message
                    }
                });
            }
            const projectId = this.resolveProjectId(req);
            const result = await resolutPublishService.preview({
                projectId,
                clientId: validation.value.client_id,
                quotes: validation.value.quotes,
                userId: req.user?.id
            });
            return res.json(result);
        } catch (err) {
            return this.handlePublishError(err, res, next);
        }
    }

    async publish(req, res, next) {
        try {
            const validation = publishSchema.validate(req.body || {});
            if (validation.error) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: validation.error.details[0].message
                    }
                });
            }
            const projectId = this.resolveProjectId(req);
            const result = await resolutPublishService.publish({
                projectId,
                clientId: validation.value.client_id,
                quotes: validation.value.quotes,
                resolutClient: validation.value.resolut_client || null,
                userId: req.user?.id,
                agentId: req.user?.agentId || null
            });
            return res.json(result);
        } catch (err) {
            return this.handlePublishError(err, res, next);
        }
    }

    async suggestQuoteLine(req, res, next) {
        try {
            const validation = suggestQuoteLineSchema.validate(req.body || {});
            if (validation.error) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: validation.error.details[0].message
                    }
                });
            }
            const projectId = this.resolveProjectId(req);
            const v = validation.value;
            const result = await resolutQuoteLineSuggestService.suggest({
                projectId,
                clientId: v.client_id,
                productId: v.product_id,
                termMonths: v.term_months,
                amount: v.amount,
                valuationType: v.valuation_type,
                pTypeOverride: v.p_type != null ? v.p_type : null,
                userId: req.user?.id
            });
            return res.json(result);
        } catch (err) {
            return this.handlePublishError(err, res, next);
        }
    }

    async planQuotes(req, res, next) {
        try {
            const validation = planQuotesBodySchema.validate(req.body || {});
            if (validation.error) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: validation.error.details[0].message
                    }
                });
            }
            const projectId = this.resolveProjectId(req);
            const v = validation.value;
            const result = await resolutPlanQuotesService.buildQuotes({
                projectId,
                clientId: v.client_id,
                termMonths: v.term_months != null ? v.term_months : null,
                includeMonthlyFlow: Boolean(v.include_monthly_flow),
                quotePatches: v.quote_patches || null
            });
            return res.json(result);
        } catch (err) {
            return this.handlePublishError(err, res, next);
        }
    }

    async planPublishPreview(req, res, next) {
        try {
            const validation = planQuotesBodySchema.validate(req.body || {});
            if (validation.error) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: validation.error.details[0].message
                    }
                });
            }
            const projectId = this.resolveProjectId(req);
            const v = validation.value;
            const built = await resolutPlanQuotesService.buildQuotes({
                projectId,
                clientId: v.client_id,
                termMonths: v.term_months != null ? v.term_months : null,
                includeMonthlyFlow: Boolean(v.include_monthly_flow),
                quotePatches: v.quote_patches || null
            });
            const preview = await resolutPublishService.preview({
                projectId,
                clientId: v.client_id,
                quotes: built.data.quotes,
                userId: req.user?.id
            });
            return res.json({
                success: true,
                data: {
                    ...preview.data,
                    quotes_built: built.data.quotes,
                    plan_skipped: built.data.skipped,
                    plan_meta: built.data.meta,
                    term_months_used: built.data.term_months_used
                }
            });
        } catch (err) {
            return this.handlePublishError(err, res, next);
        }
    }

    async publishFromPlan(req, res, next) {
        try {
            const validation = publishFromPlanSchema.validate(req.body || {});
            if (validation.error) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: validation.error.details[0].message
                    }
                });
            }
            const projectId = this.resolveProjectId(req);
            const v = validation.value;
            const built = await resolutPlanQuotesService.buildQuotes({
                projectId,
                clientId: v.client_id,
                termMonths: v.term_months != null ? v.term_months : null,
                includeMonthlyFlow: Boolean(v.include_monthly_flow),
                quotePatches: v.quote_patches || null
            });
            if (!built.data.quotes || built.data.quotes.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'RESOLUT_PLAN_NO_QUOTES',
                        message: 'No Resolut quote lines could be built from client calculation snapshot'
                    },
                    details: { skipped: built.data.skipped || [], meta: built.data.meta || null }
                });
            }
            const result = await resolutPublishService.publish({
                projectId,
                clientId: v.client_id,
                quotes: built.data.quotes,
                resolutClient: v.resolut_client || null,
                userId: req.user?.id,
                agentId: req.user?.agentId || null
            });
            return res.json({
                ...result,
                data: {
                    ...result.data,
                    plan_skipped: built.data.skipped,
                    plan_meta: built.data.meta,
                    term_months_used: built.data.term_months_used
                }
            });
        } catch (err) {
            return this.handlePublishError(err, res, next);
        }
    }

    async publications(req, res, next) {
        try {
            const clientId = Number(req.query.client_id || req.query.clientId);
            if (!Number.isFinite(clientId) || clientId <= 0) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: '"client_id" query parameter is required'
                    }
                });
            }
            const projectId = this.resolveProjectId(req);
            const limit = Number(req.query.limit || 50);
            const result = await resolutPublishService.listPublications({
                projectId,
                clientId,
                limit
            });
            return res.json(result);
        } catch (err) {
            return this.handlePublishError(err, res, next);
        }
    }
}

module.exports = new ResolutController();
