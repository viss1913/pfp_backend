const calculationService = require('../services/calculationService');
const clientService = require('../services/clientService');
const { comonShowcaseService } = require('../services/comonShowcaseService');
const reportService = require('../services/reportService');
const reportPdfService = require('../services/reportPdfService');
const {
    maybeCompressPdfBuffer,
    ensureClientReportPdfReady,
    getClientReportPdfCacheStatus,
} = require('../services/reportPdfStorageService');
const goalRecalculator = require('../algorithms/recalculators');
const { syncCalculationGoalsWithDatabase } = require('../services/clientGoalSyncService');
const riskQuestionnaireService = require('../services/riskQuestionnaireService');
const riskProfileExplanationService = require('../services/riskProfileExplanationService');
const riskProfileService = require('../services/riskProfileService');
const Joi = require('joi');

function wantsReportHtmlDocument(req) {
    const inline = String(req.query.inline || '').toLowerCase();
    const format = String(req.query.format || '').toLowerCase();
    return inline === '1' || inline === 'true' || format === 'html';
}

/** Не даём телу запроса из ЛК клиента менять привязку к агенту/юзеру (иначе agent_id мог уехать в NULL). */
function stripClientOwnershipFields(obj) {
    if (!obj || typeof obj !== 'object') return;
    delete obj.agent_id;
    delete obj.user_id;
}

function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function resolveCabinetClientId(req) {
    if (req?.user?.clientId) return Number(req.user.clientId);

    const role = String(req?.user?.role || '').toLowerCase();
    const isAgentScope = role === 'agent' || role === 'admin' || role === 'super_admin';
    if (!isAgentScope) return null;

    const raw = req?.query?.client_id ?? req?.body?.client_id ?? req?.params?.clientId;
    if (raw == null || raw === '') return null;
    const clientId = Number(raw);
    if (!Number.isFinite(clientId) || clientId <= 0) return null;
    return clientId;
}

async function computeAndPersistRiskProfileResultIfPossible({ clientId, projectId }) {
    const fullClient = await clientService.getFullClient(clientId, projectId);
    if (!fullClient) return { client: null, riskProfileResult: null };

    let answers = fullClient.risk_profile_answers;
    if (typeof answers === 'string') {
        try { answers = JSON.parse(answers); } catch (_) { answers = null; }
    }
    if (!answers || typeof answers !== 'object' || Object.keys(answers).length === 0) {
        return { client: fullClient, riskProfileResult: null };
    }

    const goals = Array.isArray(fullClient.goals) ? fullClient.goals : [];
    const goalForRisk = goals.find((g) => Number(g?.term_months || 0) > 0) || { term_months: 120 };

    const riskProfileResult = await riskProfileService.calculateGoalProfile({
        answers,
        goal: goalForRisk,
        client: fullClient,
        projectId
    });

    if (riskProfileResult) {
        await clientService.updateClient(clientId, {
            risk_profile_result: JSON.stringify(riskProfileResult),
            risk_questionnaire_version_id: riskProfileResult.questionnaire_version_id || fullClient.risk_questionnaire_version_id || null
        }, projectId);
        fullClient.risk_profile_result = riskProfileResult;
        fullClient.risk_questionnaire_version_id =
            riskProfileResult.questionnaire_version_id || fullClient.risk_questionnaire_version_id || null;
    }

    return { client: fullClient, riskProfileResult: riskProfileResult || null };
}

function shouldForceReverseModeForPatch(existingGoal, patch) {
    const goalTypeId = Number(existingGoal?.goal_type_id);
    const reverseTypes = new Set([1, 2, 4]);
    if (!reverseTypes.has(goalTypeId)) return false;

    const reverseTriggerFields = ['initial_capital', 'inflation_rate', 'target_amount', 'desired_monthly_income', 'term_months'];
    const hasReverseTrigger = reverseTriggerFields.some((key) => hasOwn(patch, key));
    const hasExplicitMonthlyChange = hasOwn(patch, 'monthly_replenishment');

    return hasReverseTrigger && !hasExplicitMonthlyChange;
}

function pickRiskProfileResult(calculationResponse) {
    const calculation = calculationResponse?.calculation || calculationResponse;
    const goals = Array.isArray(calculation?.goals) ? calculation.goals : [];
    const firstWithDetails = goals.find((goal) => goal?.risk_profile_details);
    return firstWithDetails?.risk_profile_details || null;
}

async function warmupClientPdfInBackgroundForCabinet({
    clientId,
    projectId,
    brandingAgentId = null,
    forceRegenerate = false,
}) {
    if (!clientId || !projectId) return;
    setImmediate(() => {
        void ensureClientReportPdfReady({
            clientId: Number(clientId),
            projectId: Number(projectId),
            agentId: null,
            brandingAgentId: brandingAgentId != null ? Number(brandingAgentId) : null,
            includeCover: true,
            includeSummary: true,
            goalTypes: null,
            fileNamePrefix: 'report',
            forceRegenerate,
            waitForResult: false,
        }).catch((err) => {
            console.warn('[ClientCabinet] PDF warmup failed:', err?.message || err);
        });
    });
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
const taxChildSchema = Joi.object({
    first_name: Joi.string().trim().optional(),
    birth_date: Joi.string().isoDate().required(),
    is_full_time_student: Joi.boolean().optional(),
    is_disabled: Joi.boolean().optional()
});

const riskProfileAnswersSchema = Joi.object()
    .pattern(
        Joi.string().trim().min(1),
        Joi.alternatives().try(
            Joi.string().trim().min(1),
            Joi.number().integer().min(1).max(10)
        )
    )
    .optional();

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
        risk_profile_answers: riskProfileAnswersSchema,
        risk_questionnaire_version_id: Joi.number().integer().positive().optional(),
        family_profile: familyProfileSchema,
        enable_children_tax_deduction: Joi.boolean().optional(),
        tax_children: Joi.array().items(taxChildSchema).optional()
    }).optional(),
    credits: Joi.array().items(Joi.object({
        type: Joi.string().trim().required(),
        balance: Joi.number().min(0).required(),
        monthlyPayment: Joi.number().min(0).required(),
        rate: Joi.number().min(0).required(),
        name: Joi.string().trim().optional()
    })).optional()
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
     * GET /my/risk-profile/questionnaire — questionnaire metadata for frontend rendering
     */
    async getRiskProfileQuestionnaire(req, res, next) {
        try {
            const projectId = req.projectId || req.user.projectId || null;
            const questionnaire = await riskQuestionnaireService.getActiveQuestionnaire(projectId);
            if (!questionnaire) {
                return res.status(404).json({ error: 'Risk questionnaire is not configured' });
            }
            res.json({ questionnaire });
        } catch (err) {
            next(err);
        }
    }

    /**
     * GET /my/risk-profile/questionnaire-v2 — client-friendly questionnaire without score fields
     */
    async getRiskProfileQuestionnaireV2(req, res, next) {
        try {
            const projectId = req.projectId || req.user.projectId || null;
            const questionnaire = await riskQuestionnaireService.getActiveQuestionnaireV2(projectId);
            if (!questionnaire) {
                return res.status(404).json({ error: 'Risk questionnaire is not configured' });
            }
            res.json({ questionnaire });
        } catch (err) {
            next(err);
        }
    }

    /**
     * GET /my/risk-profile/answers — current answers and scoring snapshot
     */
    async getRiskProfileAnswers(req, res, next) {
        try {
            const clientId = resolveCabinetClientId(req);
            if (!clientId) {
                return res.status(400).json({
                    error: 'Client profile not found in token (for agent/admin pass client_id)'
                });
            }

            const projectId = req.projectId || req.user.projectId;
            const client = await clientService.getFullClient(clientId, projectId);
            if (!client) {
                return res.status(404).json({ error: 'Client profile not found' });
            }

            let riskProfileResult = client.risk_profile_result || null;
            if (!riskProfileResult && client.risk_profile_answers && Object.keys(client.risk_profile_answers || {}).length > 0) {
                const computed = await computeAndPersistRiskProfileResultIfPossible({ clientId, projectId });
                if (computed.client) {
                    riskProfileResult = computed.client.risk_profile_result || computed.riskProfileResult || null;
                }
            }

            let riskProfileExplanation = null;
            if (riskProfileResult) {
                const questionnaire = await riskQuestionnaireService.getActiveQuestionnaireV2(projectId || null);
                riskProfileExplanation = await riskProfileExplanationService.build({
                    riskProfileResult,
                    answerMap: client.risk_profile_answers || {},
                    questionnaire,
                    projectId
                });
            }

            res.json({
                risk_profile_answers: client.risk_profile_answers || {},
                risk_questionnaire_version_id: client.risk_questionnaire_version_id || null,
                risk_profile_result: riskProfileResult,
                risk_profile_explanation: riskProfileExplanation
            });
        } catch (err) {
            next(err);
        }
    }

    /**
     * POST /my/risk-profile/answers — save questionnaire answers without recalculation
     */
    async saveRiskProfileAnswers(req, res, next) {
        try {
            const clientId = resolveCabinetClientId(req);
            if (!clientId) {
                return res.status(400).json({
                    error: 'Client profile not found in token (for agent/admin pass client_id)'
                });
            }

            const schema = Joi.object({
                risk_profile_answers: riskProfileAnswersSchema.required(),
                risk_questionnaire_version_id: Joi.number().integer().positive().optional()
            });
            const validation = schema.validate(req.body, { abortEarly: false, allowUnknown: false });
            if (validation.error) {
                return res.status(400).json({
                    error: 'Validation error',
                    details: validation.error.details.map((d) => ({
                        field: d.path.join('.'),
                        message: d.message
                    }))
                });
            }

            const projectId = req.projectId || req.user.projectId;
            const questionnaire = await riskQuestionnaireService.getActiveQuestionnaire(projectId);
            if (!questionnaire) {
                return res.status(404).json({ error: 'Risk questionnaire is not configured' });
            }
            const normalizedAnswers = riskQuestionnaireService.normalizeAnswerMap(
                validation.value.risk_profile_answers,
                questionnaire
            );

            await clientService.updateClient(clientId, {
                risk_profile_answers: JSON.stringify(normalizedAnswers),
                risk_questionnaire_version_id: validation.value.risk_questionnaire_version_id || questionnaire.id
            }, projectId);

            const computed = await computeAndPersistRiskProfileResultIfPossible({ clientId, projectId });
            const riskProfileResult = computed.riskProfileResult || computed.client?.risk_profile_result || null;
            let riskProfileExplanation = null;
            if (riskProfileResult) {
                const questionnaireV2 = await riskQuestionnaireService.getActiveQuestionnaireV2(projectId || null);
                riskProfileExplanation = await riskProfileExplanationService.build({
                    riskProfileResult,
                    answerMap: normalizedAnswers,
                    questionnaire: questionnaireV2,
                    projectId
                });
            }

            res.json({
                success: true,
                risk_profile_answers: normalizedAnswers,
                risk_questionnaire_version_id:
                    (riskProfileResult && riskProfileResult.questionnaire_version_id)
                    || validation.value.risk_questionnaire_version_id
                    || questionnaire.id,
                risk_profile_result: riskProfileResult,
                risk_profile_explanation: riskProfileExplanation
            });
        } catch (err) {
            next(err);
        }
    }


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
            const forceRegenerate = req.query.forceRegenerate === '1' || req.query.forceRegenerate === 'true';
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
            const finalPdf = (await maybeCompressPdfBuffer(pdfBuffer)).buffer;

            const ts = new Date().toISOString().slice(0, 10);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader(
                'Content-Disposition',
                `${useAttachment ? 'attachment' : 'inline'}; filename="report-client-${clientId}-${ts}.pdf"`
            );
            res.setHeader('Cache-Control', 'private, no-store');
            res.send(finalPdf);
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

            const cacheState = await getClientReportPdfCacheStatus({ clientId: Number(clientId), projectId });
            if (!forceRegenerate && cacheState.status === 'ready' && cacheState.pdfUrl) {
                return res.json({
                    status: 'ready',
                    pdf_url: cacheState.pdfUrl,
                    toc: [],
                    compressed: true,
                    generated_at: cacheState.generatedAt || new Date().toISOString(),
                });
            }

            const uploadRes = await ensureClientReportPdfReady({
                clientId: Number(clientId),
                agentId: null,
                brandingAgentId,
                projectId,
                includeCover,
                includeSummary,
                goalTypes,
                fileNamePrefix: 'report',
                forceRegenerate,
                waitForResult: false,
            });

            if (uploadRes.status !== 'ready') {
                return res.status(202).json({
                    status: 'processing',
                    pdf_url: uploadRes.pdfUrl || null,
                    compressed: !!uploadRes.compressed,
                    generated_at: uploadRes.generatedAt || null,
                });
            }

            res.json({
                status: 'ready',
                pdf_url: uploadRes.pdfUrl,
                toc: Array.isArray(uploadRes.toc) ? uploadRes.toc : [],
                compressed: !!uploadRes.compressed,
                generated_at: new Date().toISOString(),
            });
        } catch (err) {
            next(err);
        }
    }

    /**
     * GET /my/plan/report/html — HTML отчёта текущего клиента (для предпросмотра на фронте).
     */
    async getMyReportHtml(req, res, next) {
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

            const { mergedHtml, pageHtmlList, toc } = await reportPdfService.generateClientReportHtmlPackage({
                clientId: Number(clientId),
                agentId: null,
                brandingAgentId,
                projectId,
                includeCover,
                includeSummary,
                goalTypes,
            });

            if (wantsReportHtmlDocument(req)) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.setHeader('Cache-Control', 'private, no-store');
                res.send(mergedHtml);
                return;
            }

            res.json({
                html: mergedHtml,
                pages: pageHtmlList,
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
                        : undefined,
                    risk_questionnaire_version_id: req.body.client?.risk_questionnaire_version_id || undefined,
                    risk_profile_result: pickRiskProfileResult(calculationResponse)
                        ? JSON.stringify(pickRiskProfileResult(calculationResponse))
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
                const numericFields = [
                    'target_amount',
                    'initial_capital',
                    'term_months',
                    'monthly_replenishment',
                    'priority',
                    'goal_type_id',
                    'desired_monthly_income',
                    'id',
                    'goal_id',
                    'ipk_current',
                    'ipk_forecast',
                    'ipk_total',
                    'ops_capital',
                ];
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
                const preparedPatch = { ...req.body };
                if (shouldForceReverseModeForPatch(existing, preparedPatch)) {
                    preparedPatch.monthly_replenishment = null;
                }
                const updated = goalRecalculator.prepare(existing, preparedPatch);
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
            const calculatedGoals = calculation?.goals || [];
            const calculatedTargetGoal = calculatedGoals.find((goalResult) =>
                String(goalResult?.goal_id || goalResult?.id || '') === String(identifiedTargetId)
            );

            if (calculatedTargetGoal?.summary) {
                const summary = calculatedTargetGoal.summary;
                const goalTypeId = Number(updatedGoalData?.goal_type_id);
                const isForwardMode = Number(updatedGoalData?.monthly_replenishment) > 0;

                if (isForwardMode) {
                    if (summary.target_amount_initial != null) {
                        updatedGoalData.target_amount = Number(summary.target_amount_initial);
                    }
                    if (goalTypeId === 1 || goalTypeId === 2) {
                        updatedGoalData.desired_monthly_income = Number(summary.target_amount_initial || 0);
                    }
                }
            }

            await clientService.updateGoal(clientId, identifiedTargetId, updatedGoalData);

            // Also update client profile if new data (like answers) was provided
            if (req.body.client) {
                const clientUpdate = { ...req.body.client };
                stripClientOwnershipFields(clientUpdate);
                if (clientUpdate.risk_profile_answers) {
                    clientUpdate.risk_profile_answers = JSON.stringify(clientUpdate.risk_profile_answers);
                }
                const riskProfileResult = pickRiskProfileResult(calculationResponse);
                if (riskProfileResult) {
                    clientUpdate.risk_profile_result = JSON.stringify(riskProfileResult);
                }
                await clientService.updateClient(clientId, clientUpdate, projectId);
            }

            await syncCalculationGoalsWithDatabase(clientId, calculation);

            await clientService.updateClient(clientId, {
                goals_summary: JSON.stringify(calculationResponse)
            });

            warmupClientPdfInBackgroundForCabinet({
                clientId,
                projectId,
                brandingAgentId: existingClient?.agent_id || null,
                forceRegenerate: true,
            });

            res.json(calculationService.simplify(calculationResponse));
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new ClientCabinetController();
