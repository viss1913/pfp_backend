const calculationService = require('../services/calculationService');
const clientService = require('../services/clientService');
const { comonShowcaseService } = require('../services/comonShowcaseService');
const reportService = require('../services/reportService');
const reportPdfService = require('../services/reportPdfService');
const { uploadPublicFile } = require('../utils/r2Client');
const goalRecalculator = require('../algorithms/recalculators');
const { syncCalculationGoalsWithDatabase } = require('../services/clientGoalSyncService');
const Joi = require('joi');

/** Не даём телу запроса из ЛК клиента менять привязку к агенту/юзеру (иначе agent_id мог уехать в NULL). */
function stripClientOwnershipFields(obj) {
    if (!obj || typeof obj !== 'object') return;
    delete obj.agent_id;
    delete obj.user_id;
}

const familyProfileSchema = Joi.object({
    marital_status: Joi.string().valid('single', 'married', 'divorced', 'widowed', 'civil_union').optional(),
    children: Joi.array().items(Joi.object({
        first_name: Joi.string().trim().required(),
        birth_date: Joi.string().isoDate().required()
    })).optional(),
    contacts: Joi.array().items(Joi.object({
        name: Joi.string().trim().required(),
        relation: Joi.string().trim().required(),
        phone: Joi.string().trim().optional(),
        email: Joi.string().email().optional()
    })).optional(),
    spouse: Joi.object({
        employment_status: Joi.string().valid('employed', 'self_employed', 'unemployed', 'retired', 'other').optional(),
        monthly_income: Joi.number().min(0).allow(null).optional()
    }).optional(),
    family_obligations: Joi.array().items(Joi.object({
        type: Joi.string().valid(
            'loans',
            'mortgage',
            'rent',
            'alimony',
            'education',
            'elder_support',
            'other'
        ).required(),
        amount_monthly: Joi.number().min(0).required()
    })).optional(),
    real_estate: Joi.array().items(Joi.object({
        name: Joi.string().trim().optional(),
        estimated_value: Joi.number().min(0).required(),
        status: Joi.string().valid('owned', 'mortgage').required()
    })).optional(),
    confidentiality: Joi.object({
        allow_spouse_access: Joi.boolean().optional(),
        allow_family_contact: Joi.boolean().optional(),
        notes: Joi.string().allow('').optional()
    }).optional()
}).optional();

// Reuse the same validation schema as clientController
const calculationRequestSchema = Joi.object({
    goals: Joi.array().items(Joi.object({
        goal_type_id: Joi.number().integer().positive().required(),
        name: Joi.string().required(),
        target_amount: Joi.number().min(0).optional(),
        term_months: Joi.number().integer().min(0).optional(),
        desired_monthly_income: Joi.number().min(0).optional(),
        risk_profile: Joi.string().valid('CONSERVATIVE', 'BALANCED', 'AGGRESSIVE').optional(),
        initial_capital: Joi.number().min(0).optional().default(0),
        inflation_rate: Joi.number().min(0).optional(),
        avg_monthly_income: Joi.number().min(0).optional(),
        start_date: Joi.string().optional(),
        payment_variant: Joi.number().integer().valid(0, 1, 2, 4, 12).optional(),
        program: Joi.string().optional(),
        monthly_replenishment: Joi.number().min(0).optional(),
        id: Joi.string().optional(),
        priority: Joi.number().integer().min(1).max(10).optional()
    })).min(1).required(),
    client: Joi.object({
        risk_profile_answers: Joi.object().pattern(
            Joi.string().regex(/^q[2-9]|q10$/),
            Joi.number().integer().min(1).max(5)
        ).optional(),
        family_profile: familyProfileSchema
    }).optional()
}).options({ allowUnknown: true });

/**
 * Client Cabinet Controller
 * 
 * All methods work with the authenticated client's own data.
 * clientId is always taken from JWT token (req.user.clientId).
 * No access to other clients' data.
 */
class ClientCabinetController {

    /**
     * GET /my/plan — Get the client's own financial plan
     */
    async getMyPlan(req, res, next) {
        try {
            const clientId = req.user.clientId;
            if (!clientId) {
                return res.status(400).json({ error: 'Client profile not found in token' });
            }

            const projectId = req.projectId || req.user.projectId;
            const client = await clientService.getFullClient(clientId, projectId);
            if (!client) {
                return res.status(404).json({ error: 'Client profile not found' });
            }

            res.json(calculationService.simplify(client));
        } catch (err) {
            next(err);
        }
    }

    /**
     * GET /my/plan/report — JSON отчёта для PDF/графиков (как GET /api/pfp/reports/:clientId), только свой clientId из токена.
     */
    async getMyReport(req, res, next) {
        try {
            const clientId = req.user.clientId;
            if (!clientId) {
                return res.status(400).json({ error: 'Client profile not found in token' });
            }

            const projectId = req.projectId || req.user.projectId;
            const reportData = await reportService.getClientReportData(clientId, projectId);
            res.json(reportData);
        } catch (err) {
            next(err);
        }
    }

    /**
     * GET /my/plan/comon-showcase — витрина стратегий Comon (тот же отбор, что поле comon_showcase в GET /my/plan/report).
     */
    async getMyComonShowcase(req, res, next) {
        try {
            const clientId = req.user.clientId;
            if (!clientId) {
                return res.status(400).json({ error: 'Client profile not found in token' });
            }

            const projectId = req.projectId || req.user.projectId;
            const client = await clientService.getFullClient(clientId, projectId);
            if (!client) {
                return res.status(404).json({ error: 'Client profile not found' });
            }

            const assetsTotal = (client.assets || []).reduce(
                (sum, a) => sum + Number(a.current_value || a.amount || 0),
                0
            );
            const liabilitiesTotal = (client.liabilities || []).reduce(
                (sum, l) => sum + Number(l.remaining_amount || 0),
                0
            );
            const currentSituation = { net_worth: assetsTotal - liabilitiesTotal };

            const payload = await comonShowcaseService.buildForClient(client, projectId, currentSituation);
            if (!payload) {
                return res.json({ enabled: false });
            }
            res.json(payload);
        } catch (err) {
            next(err);
        }
    }

    /**
     * GET /my/plan/report/pdf — PDF с данными плана и брендингом агента с карточки клиента (или дефолты без agent_id).
     */
    async getMyReportPdf(req, res, next) {
        try {
            const clientId = req.user.clientId;
            if (!clientId) {
                return res.status(400).json({ error: 'Client profile not found in token' });
            }

            const projectId = req.projectId || req.user.projectId;
            const client = await clientService.getFullClient(clientId, projectId);
            if (!client) {
                return res.status(404).json({ error: 'Client profile not found' });
            }

            const includeCover = req.query.includeCover !== '0' && req.query.includeCover !== 'false';
            const includeSummary = req.query.includeSummary !== '0' && req.query.includeSummary !== 'false';
            const goalTypes = req.query.goalTypes || null;
            const useAttachment = String(req.query.disposition || '').toLowerCase() === 'attachment';

            const brandingAgentId =
                client.agent_id != null && client.agent_id !== ''
                    ? Number(client.agent_id)
                    : null;

            const pdfBuffer = await reportPdfService.generateClientReportPdf({
                clientId: Number(clientId),
                agentId: null,
                brandingAgentId,
                projectId,
                includeCover,
                includeSummary,
                goalTypes,
            });

            const ts = new Date().toISOString().slice(0, 10);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader(
                'Content-Disposition',
                `${useAttachment ? 'attachment' : 'inline'}; filename="report-client-${clientId}-${ts}.pdf"`
            );
            res.setHeader('Cache-Control', 'private, no-store');
            res.send(pdfBuffer);
        } catch (err) {
            next(err);
        }
    }

    /**
     * GET /my/plan/report/pdf-url — JSON с ссылкой на PDF в storage + оглавление.
     */
    async getMyReportPdfUrl(req, res, next) {
        try {
            const clientId = req.user.clientId;
            if (!clientId) {
                return res.status(400).json({ error: 'Client profile not found in token' });
            }

            const projectId = req.projectId || req.user.projectId;
            const client = await clientService.getFullClient(clientId, projectId);
            if (!client) {
                return res.status(404).json({ error: 'Client profile not found' });
            }

            const includeCover = req.query.includeCover !== '0' && req.query.includeCover !== 'false';
            const includeSummary = req.query.includeSummary !== '0' && req.query.includeSummary !== 'false';
            const goalTypes = req.query.goalTypes || null;

            const brandingAgentId =
                client.agent_id != null && client.agent_id !== ''
                    ? Number(client.agent_id)
                    : null;

            const { pdfBuffer, toc } = await reportPdfService.generateClientReportPdfPackage({
                clientId: Number(clientId),
                agentId: null,
                brandingAgentId,
                projectId,
                includeCover,
                includeSummary,
                goalTypes,
            });

            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            const key = `pdf-reports/${projectId || 'no-project'}/${clientId}/report-${ts}.pdf`;
            const uploadResult = await uploadPublicFile({
                key,
                body: pdfBuffer,
                contentType: 'application/pdf',
            });

            if (!uploadResult?.ok || !uploadResult?.url) {
                const detail = uploadResult?.detail || uploadResult?.reason || 'Storage upload failed';
                return res.status(503).json({ error: 'Failed to upload generated PDF', detail });
            }

            res.json({
                pdf_url: uploadResult.url,
                toc: Array.isArray(toc) ? toc : [],
                generated_at: new Date().toISOString(),
            });
        } catch (err) {
            next(err);
        }
    }

    /**
     * POST /my/plan/first-run — Create the client's first financial plan
     */
    async createMyPlan(req, res, next) {
        try {
            const clientId = req.user.clientId;
            if (!clientId) {
                return res.status(400).json({ error: 'Client profile not found in token' });
            }

            // Validate
            const validation = calculationRequestSchema.validate(req.body, { abortEarly: false, allowUnknown: true });
            if (validation.error) {
                return res.status(400).json({
                    error: 'Validation error',
                    details: validation.error.details.map(d => ({
                        field: d.path.join('.'),
                        message: d.message
                    }))
                });
            }

            const projectId = req.projectId || req.user.projectId;

            // Inject project and client context
            if (!req.body.client) req.body.client = {};
            req.body.client.project_id = projectId;

            if (!projectId) {
                return res.status(400).json({ error: 'Project context is missing' });
            }

            console.log(`[ClientCabinet] createMyPlan for clientId=${clientId}, project=${projectId}`);

            // Perform calculation
            const calculationResponse = await calculationService.calculateFirstRun(
                req.body, null, null, { isFirstRun: true, usePool: true }
            );
            const calculation = calculationResponse.calculation || calculationResponse;

            // Update existing client record (don't create new one)
            const existingClient = await clientService.getFullClient(clientId, projectId);
            if (!existingClient) {
                return res.status(404).json({ error: 'Client profile not found' });
            }

            // Merge client data with existing profile
            const updateData = {
                client: {
                    ...req.body.client,
                    id: clientId,
                    risk_profile_answers: req.body.client?.risk_profile_answers
                        ? JSON.stringify(req.body.client.risk_profile_answers)
                        : undefined
                },
                goals: req.body.goals
            };
            stripClientOwnershipFields(updateData.client);
            await clientService.updateFullClient(clientId, updateData);

            // Sync goal IDs
            await syncCalculationGoalsWithDatabase(clientId, calculation);

            // Save calculation snapshot
            await clientService.updateClient(clientId, {
                goals_summary: JSON.stringify(calculationResponse)
            });

            calculationResponse.client_id = clientId;
            res.json(calculationService.simplify(calculationResponse));
        } catch (err) {
            next(err);
        }
    }

    /**
     * POST /my/plan/:goalId/recalculate — Recalculate a specific goal
     */
    async recalculateGoal(req, res, next) {
        try {
            const clientId = req.user.clientId;
            if (!clientId) {
                return res.status(400).json({ error: 'Client profile not found in token' });
            }

            const { goalId } = req.params;
            const projectId = req.projectId || req.user.projectId;

            if (!projectId) {
                return res.status(400).json({ error: 'Project context missing' });
            }

            // Fetch existing client data
            const existingClient = await clientService.getFullClient(clientId, projectId);
            if (!existingClient) {
                return res.status(404).json({ error: 'Client profile not found' });
            }

            // Build goals map from DB
            const existingGoals = (existingClient.goals || []).map(g => {
                let parsed = { ...g };
                let fromParams = {};
                if (typeof g.params === 'string') {
                    try { fromParams = JSON.parse(g.params); } catch (e) { }
                } else if (typeof g.params === 'object' && g.params !== null) {
                    fromParams = g.params;
                }
                parsed = { ...fromParams, ...g };
                const numericFields = ['target_amount', 'initial_capital', 'term_months', 'monthly_replenishment', 'priority', 'goal_type_id', 'desired_monthly_income', 'id', 'goal_id'];
                numericFields.forEach(field => {
                    if (parsed[field] !== undefined && parsed[field] !== null) parsed[field] = Number(parsed[field]);
                });
                return parsed;
            });

            const goalsMap = new Map();
            existingGoals.forEach(g => { if (g.id) goalsMap.set(String(g.id), g); });

            let identifiedTargetId = null;

            // Apply updates to target goal
            if (goalId && goalsMap.has(String(goalId))) {
                const existing = goalsMap.get(String(goalId));
                const updated = goalRecalculator.prepare(existing, req.body);
                goalsMap.set(String(goalId), updated);
                identifiedTargetId = String(goalId);
            } else {
                return res.status(404).json({ error: 'Goal not found' });
            }

            const goalsToCalculate = Array.from(goalsMap.values());

            // Merge client data
            const clientForCalc = {
                ...existingClient,
                ...req.body.client,
                assets: req.body.client?.assets || existingClient.assets || [],
                total_liquid_capital: req.body.client?.total_liquid_capital !== undefined
                    ? req.body.client.total_liquid_capital
                    : (existingClient.total_liquid_capital !== undefined ? Number(existingClient.total_liquid_capital) : (existingClient.assets_total || 0)),
                risk_profile_answers: req.body.client?.risk_profile_answers || existingClient.risk_profile_answers
            };
            clientForCalc.project_id = projectId;

            // Run calculation
            const calcRequest = { client: clientForCalc, goals: goalsToCalculate };
            let previousCalculation = null;
            try {
                previousCalculation = typeof existingClient.goals_summary === 'string'
                    ? JSON.parse(existingClient.goals_summary)
                    : existingClient.goals_summary;
            } catch (e) { }

            const calculationResponse = await calculationService.calculateFirstRun(
                calcRequest, identifiedTargetId, previousCalculation,
                { isFirstRun: false, usePool: false }
            );

            // Persist
            const calculation = calculationResponse.calculation || calculationResponse;
            const updatedGoalData = goalsMap.get(identifiedTargetId);
            await clientService.updateGoal(clientId, identifiedTargetId, updatedGoalData);

            // Also update client profile if new data (like answers) was provided
            if (req.body.client) {
                const clientUpdate = { ...req.body.client };
                stripClientOwnershipFields(clientUpdate);
                if (clientUpdate.risk_profile_answers) {
                    clientUpdate.risk_profile_answers = JSON.stringify(clientUpdate.risk_profile_answers);
                }
                await clientService.updateClient(clientId, clientUpdate, projectId);
            }

            await syncCalculationGoalsWithDatabase(clientId, calculation);

            await clientService.updateClient(clientId, {
                goals_summary: JSON.stringify(calculationResponse)
            });

            res.json(calculationService.simplify(calculationResponse));
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new ClientCabinetController();
