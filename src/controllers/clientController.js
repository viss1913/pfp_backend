const calculationService = require('../services/calculationService');
const Joi = require('joi');

const familyProfileObjectSchema = Joi.object({
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

const familyProfileSchema = Joi.alternatives().try(
    familyProfileObjectSchema,
    Joi.array().items(Joi.object().unknown(true))
).optional();
const taxChildSchema = Joi.object({
    first_name: Joi.string().trim().optional(),
    birth_date: Joi.string().isoDate().required(),
    is_full_time_student: Joi.boolean().optional(),
    is_disabled: Joi.boolean().optional()
});

const riskProfileAnswersSchema = Joi.object().pattern(
    Joi.string().trim().min(1),
    Joi.alternatives().try(
        Joi.string().trim().min(1),
        Joi.number().integer().min(1).max(10)
    )
).optional();

const calcAssetItemSchema = Joi.object({
    type: Joi.string().required(),
    amount: Joi.number().min(0).optional(),
    current_value: Joi.number().min(0).optional(),
    unlock_month: Joi.number().integer().min(0).optional(),
    sell_month: Joi.number().integer().min(0).optional(),
    name: Joi.string().optional(),
    goal_id: Joi.string().allow(null).optional(),
});

// Схема валидации для запроса расчета
const calculationRequestSchema = Joi.object({
    goals: Joi.array().items(Joi.object({
        goal_type_id: Joi.number().integer().positive().required()
            .description('ID класса портфеля (из portfolio_classes). Для LIFE используйте 5'),
        name: Joi.string().required()
            .description('Название цели'),
        target_amount: Joi.number().min(0).optional()
            .description('Целевая сумма (опционально для INVESTMENT/PASSIVE_INCOME, обязательно для других целей типа ПОКУПКА)'),
        term_months: Joi.number().integer().min(0).optional()
            .description('Срок достижения цели в месяцах. Для PENSION можно не указывать (будет рассчитан автоматически до выхода на пенсию)'),
        desired_monthly_income: Joi.number().min(0).optional()
            .description('Желаемый ежемесячный доход (для PASSIVE_INCOME)'),
        risk_profile: Joi.string().valid('CONSERVATIVE', 'BALANCED', 'AGGRESSIVE').optional()
            .description('Риск-профиль (3 уровня): CONSERVATIVE, BALANCED или AGGRESSIVE'),
        risk_profile_extended: Joi.string()
            .valid('CONSERVATIVE', 'MODERATELY_CONSERVATIVE', 'BALANCED', 'MODERATELY_AGGRESSIVE', 'AGGRESSIVE')
            .allow(null)
            .optional()
            .description('Расширенный риск-профиль (5 уровней); для портфеля с MODERATELY_* срезами; иначе можно не передавать'),
        initial_capital: Joi.number().min(0).optional().default(0)
            .description('Начальный капитал (опционально, по умолчанию 0)'),
        inflation_rate: Joi.number().min(0).optional()
            .description('Годовая ставка инфляции в % (опционально, берется из настроек если не указано)'),
        avg_monthly_income: Joi.number().min(0).optional()
            .description('Среднемесячный доход до НДФЛ (₽/мес). Требуется для расчета софинансирования ПДС'),
        start_date: Joi.string().optional()
            .description('Дата начала цели (формат: YYYY-MM-DD или ISO 8601). По умолчанию текущая дата'),
        // Параметры для НСЖ (LIFE)
        payment_variant: Joi.number().integer().valid(0, 1, 2, 4, 12).optional()
            .description('Вариант оплаты для НСЖ: 0 - единовременно, 1 - ежегодно, 2 - раз в полгода, 4 - ежеквартально, 12 - ежемесячно'),
        program: Joi.string().optional()
            .description('Код продукта НСЖ (по умолчанию "base")'),
        monthly_replenishment: Joi.number().min(0).optional()
            .description('Ежемесячное пополнение (планируемое, для некоторых целей)'),
        id: Joi.string().optional()
            .description('Уникальный ID цели (для связки с активами)'),
        priority: Joi.number().integer().min(1).max(10).optional()
            .description('Приоритет цели (1 - самый высокий). Если не указан, определяется по типу цели')
    })).min(1).required()
        .description('Массив целей для расчета'),
    assets: Joi.array().items(calcAssetItemSchema).optional()
        .description('Активы в корне тела (альтернатива client.assets; фронт часто шлёт сюда)'),
    ref: Joi.string().max(128).allow('').optional()
        .description('referral_slug или UUID агента — для привязки лида в CRM'),
    client: Joi.object({
        birth_date: Joi.string().optional()
            .description('Дата рождения клиента (формат: YYYY-MM-DD или ISO 8601). Требуется для расчета НСЖ и Пенсии'),
        sex: Joi.string().valid('male', 'female', 'M', 'F', 'мужской', 'женский').optional()
            .description('Пол клиента. Требуется для расчета НСЖ и Пенсии'),
        fio: Joi.string().optional()
            .description('ФИО клиента'),
        name: Joi.string().optional()
            .description('Имя клиента (альтернатива fio)'),
        phone: Joi.string().optional()
            .description('Телефон клиента'),
        email: Joi.string().email().optional()
            .description('Email клиента'),
        avg_monthly_income: Joi.number().min(0).optional()
            .description('Среднемесячный доход до НДФЛ (₽/мес). Используется для оценки ИПК при расчете пенсии и для расчета софинансирования ПДС'),
        spouse_avg_monthly_income: Joi.number().min(0).allow(null).optional()
            .description('Среднемесячный доход супруги/супруга до НДФЛ (₽/мес). Учитывается в отчёте в строке «Доходы» (семейный денежный поток), если не задан family_profile.spouse.monthly_income'),
        ipk_current: Joi.number().min(0).allow(null).optional()
            .description('Текущий ИПК (индивидуальный пенсионный коэффициент) клиента. Если не указан, будет оценен на основе дохода'),
        total_liquid_capital: Joi.number().min(0).optional().default(0)
            .description('Общий ликвидный капитал клиента (Бассейн)'),
        assets: Joi.array().items(calcAssetItemSchema).optional().default([])
            .description('Список активов клиента (депозиты, недвижимость и т.д.)'),
        insured_person: Joi.object({
            is_policy_holder: Joi.boolean().optional()
                .description('Является ли застрахованный страхователем'),
            birth_date: Joi.string().optional()
                .description('Дата рождения застрахованного (если отличается от страхователя)'),
            sex: Joi.string().valid('male', 'female', 'M', 'F').optional()
                .description('Пол застрахованного')
        }).optional()
            .description('Данные застрахованного лица (если отличается от страхователя)'),
        family_profile: familyProfileSchema
            .description('Семейный профиль (дети, обязательства, супруг). Доход супруги/супруга: spouse.monthly_income — в т.ч. строка «Доходы» в PDF отчёта (семейный поток); на калькуляторы целей по умолчанию не влияет'),
        enable_children_tax_deduction: Joi.boolean().optional()
            .description('Включить расчет стандартного вычета на детей в firstRun'),
        tax_children: Joi.array().items(taxChildSchema).optional()
            .description('Дети для налогового расчета (если не передано, может использоваться family_profile.children)'),
        risk_profile_answers: riskProfileAnswersSchema
            .description('Ответы на вопросы risk questionnaire (код вопроса -> код/score варианта)'),
        risk_questionnaire_version_id: Joi.number().integer().positive().optional()
            .description('Версия анкеты риск-профиля, по которой собраны ответы')
    }).optional()
        .description('Данные клиента (опционально, но рекомендуется для расчета НСЖ и Пенсии)'),
    credits: Joi.array().items(Joi.object({
        type: Joi.string().trim().required(),
        balance: Joi.number().min(0).required(),
        monthlyPayment: Joi.number().min(0).required(),
        rate: Joi.number().min(0).required(),
        name: Joi.string().trim().optional()
    })).optional()
        .description('Алиас для liabilities: кредиты клиента (будут сохранены как liabilities)')
});
const clientPatchRequestSchema = calculationRequestSchema
    .fork(['goals'], (schema) => schema.optional())
    .or('client', 'assets', 'liabilities', 'credits', 'expenses', 'goals');

const taxPlanningRequestSchema = Joi.object({
    client: Joi.object({
        avg_monthly_income: Joi.number().min(0).required(),
        spouse_avg_monthly_income: Joi.number().min(0).allow(null).optional(),
        tax_children: Joi.array().items(taxChildSchema).default([]),
        tax_family_mode: Joi.string().valid('single', 'both_parents', 'single_parent_double').default('single')
    }).required(),
    deductions: Joi.object({
        property_purchase_amount: Joi.number().min(0).default(0),
        mortgage_interest_amount: Joi.number().min(0).default(0),
        social_expenses_amount: Joi.number().min(0).default(0)
    }).default({})
});

const sendNdaSchema = Joi.object({
    client_email: Joi.string().trim().email().required(),
    client_full_name: Joi.string().trim().min(2).max(500).required(),
    client_phone: Joi.string().trim().min(1).max(50).required(),
    client_birth_date: Joi.string().isoDate().required(),
    client_gender: Joi.string().valid('male', 'female').required(),
});

const sendLifeOfferSchema = Joi.object({
    offer_url: Joi.string().uri().optional(),
    short_description: Joi.string().trim().max(2000).optional(),
});

const sendBrokerOfferSchema = Joi.object({
    open_url: Joi.string().uri().optional(),
    short_description: Joi.string().trim().max(2000).optional(),
});

const guestRiskEvaluateSchema = Joi.object({
    risk_profile_answers: riskProfileAnswersSchema.required(),
    goal: Joi.object({
        goal_type_id: Joi.number().integer().positive().optional(),
        term_months: Joi.number().integer().min(0).optional(),
        name: Joi.string().optional(),
    }).optional().default({}),
    client: Joi.object({
        avg_monthly_income: Joi.number().min(0).optional(),
        assets_total: Joi.number().min(0).optional(),
        liabilities_total: Joi.number().min(0).optional(),
        net_worth: Joi.number().min(0).optional(),
        dependents_count: Joi.number().integer().min(0).optional(),
        family_profile: familyProfileSchema,
    }).optional().default({}),
});

const guestPlanSaveSchema = calculationRequestSchema;

const guestAiB2cSessionSchema = Joi.object({
    ref: Joi.string().max(128).allow('').optional(),
    flow_key: Joi.string().max(64).allow('').optional(),
});

function normalizeGuestCalculationPayload(body) {
    normalizeCalculationRequestBody(body);
}

/**
 * Подготовка гостевого лида: email + ref → agent_id. Без email — null (только расчёт).
 * @returns {Promise<{ projectId: number, normalizedEmail: string }|null>}
 */
async function prepareGuestLeadPersistence(req) {
    const projectId = req.projectId || req.body.client?.project_id;
    if (!projectId) return null;

    normalizeGuestCalculationPayload(req.body);

    const normalizedEmail = normalizeRegistrationEmail(req.body.client?.email);
    if (!normalizedEmail) return null;

    req.body.client.email = normalizedEmail;
    req.body.client.project_id = projectId;

    const existingUser = await db('users')
        .where({ email: normalizedEmail, project_id: projectId, is_active: true })
        .first();
    if (existingUser) {
        throw {
            status: 400,
            message: 'Email уже зарегистрирован. Войдите в аккаунт или используйте другой email.',
        };
    }

    const existingClient = await clientRepository.findByEmail(normalizedEmail, projectId);
    if (existingClient?.user_id) {
        throw {
            status: 400,
            message: 'Клиент с этим email уже привязан к аккаунту. Войдите в личный кабинет.',
        };
    }

    const ref = req.body.ref;
    const alreadyHasAgent = Boolean(existingClient?.agent_id);
    if (!alreadyHasAgent && ref != null && String(ref).trim() !== '') {
        const parentAgent = await agentNetworkService.resolveParentAgentFromRef(projectId, ref);
        if (parentAgent) {
            req.body.client.agent_id = parentAgent.id;
        }
    }

    return { projectId, normalizedEmail };
}

async function attachCatalogAgentToClient(req) {
    if (!req.body.client) req.body.client = {};
    const { normalizeAgentId } = require('../utils/agentCatalogScope');
    if (normalizeAgentId(req.body.client.agent_id)) return;

    const fromUser = normalizeAgentId(req.user?.agentId);
    if (fromUser) {
        req.body.client.agent_id = fromUser;
        return;
    }

    const ref = req.body.ref;
    const projectId = req.projectId || req.user?.projectId || req.body.client.project_id;
    if (ref != null && String(ref).trim() !== '' && projectId) {
        const parentAgent = await agentNetworkService.resolveParentAgentFromRef(projectId, ref);
        if (parentAgent) req.body.client.agent_id = parentAgent.id;
    }
}

async function finishGuestLeadPersistence(req, calculationResponse, persistCtx) {
    if (!persistCtx) return null;

    const { projectId, normalizedEmail } = persistCtx;
    const { clientId } = await persistCalculatedPlan(req.body, calculationResponse, projectId);
    const guestToken = authService.signGuestClientToken({
        clientId,
        projectId,
        email: normalizedEmail,
    });

    calculationResponse.client_id = clientId;
    warmupClientPdfInBackground({
        clientId,
        projectId,
        agentId: req.body.client?.agent_id || null,
        forceRegenerate: true,
    });

    return {
        client_id: clientId,
        guest_token: guestToken,
        plan_saved: true,
    };
}

const clientService = require('../services/clientService');
const aiB2cService = require('../services/aiB2cService');
const constructorSiteChatAgentService = require('../services/constructorSiteChatAgentService');
const goalRecalculator = require('../algorithms/recalculators');
const { patchHasExplicitManualGoalRisk, applyManualGoalRiskSanitize } = require('../utils/goalManualRisk');
const { syncCalculationGoalsWithDatabase } = require('../services/clientGoalSyncService');
const taxPlanningService = require('../services/taxPlanningService');
const ndaService = require('../services/ndaService');
const agentService = require('../services/agentService');
const projectService = require('../services/projectService');
const emailService = require('../services/emailService');
const commissionService = require('../services/commissionService');
const { buildTrackedPartnerUrl } = require('../utils/trackedPartnerUrl');
const { resolveLastRebalanceAt, hasPlan } = require('../utils/goalsSummaryMetrics');
const { resolveLifeOfferEmailPayload } = require('../utils/atbBankBranding');
const riskQuestionnaireService = require('../services/riskQuestionnaireService');
const riskProfileService = require('../services/riskProfileService');
const riskProfileExplanationService = require('../services/riskProfileExplanationService');
const authService = require('../services/authService');
const agentNetworkService = require('../services/agentNetworkService');
const db = require('../config/database');
const clientRepository = require('../repositories/clientRepository');
const { normalizeRegistrationEmail } = require('../utils/userEmailRegistration');
const { normalizeCalculationRequestBody } = require('../utils/normalizeCalculationPayload');
const { allowGuestSessionByIp, clientIpFromReq } = require('../utils/guestSessionRateLimit');

function attachCrmClientDates(clientRow) {
    const createdAt = clientRow.created_at;
    let created_at_iso = createdAt;
    if (createdAt instanceof Date) {
        created_at_iso = createdAt.toISOString();
    } else if (createdAt != null && typeof createdAt !== 'string') {
        const d = new Date(createdAt);
        created_at_iso = Number.isNaN(d.getTime()) ? createdAt : d.toISOString();
    }
    return {
        ...clientRow,
        created_at: created_at_iso,
        last_rebalance_at: resolveLastRebalanceAt(clientRow.goals_summary, clientRow.updated_at),
        has_plan: hasPlan(clientRow.goals_summary),
        registration_status: clientRow.user_id ? 'registered' : 'lead',
    };
}
const { parseProjectSettings } = require('../utils/projectSettings');
const { assertAgentCanMutateClient } = require('../utils/agentClientAccess');
const { ensureClientReportPdfReady } = require('../services/reportPdfStorageService');
const pdfWarmupScheduleByClient = new Map();

function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj || {}, key);
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

function normalizeClientGender(raw) {
    const s = String(raw || '').toLowerCase();
    if (s === 'female' || s === 'f' || s === 'ж' || s === 'женский') return 'female';
    return 'male';
}

function buildAgentDisplayFullName(agent) {
    const parts = [agent?.last_name, agent?.first_name, agent?.middle_name].filter(Boolean);
    return parts.length ? parts.join(' ') : '—';
}

async function persistCalculatedPlan(body, calculationResponse, projectId) {
    const calculation = calculationResponse.calculation || calculationResponse;
    const clientId = await clientService.createFullClient(body);
    await syncCalculationGoalsWithDatabase(clientId, calculation);
    await clientService.persistGoalsSummary(clientId, calculationResponse, projectId);
    return { clientId, calculation };
}

async function warmupClientPdfInBackground({ clientId, projectId, agentId, forceRegenerate = false }) {
    if (!clientId || !projectId) return;
    const now = Date.now();
    const minIntervalMs = 90 * 1000;
    const k = `${projectId}:${clientId}`;
    const lastTs = Number(pdfWarmupScheduleByClient.get(k) || 0);
    if (now - lastTs < minIntervalMs) return;
    pdfWarmupScheduleByClient.set(k, now);
    setImmediate(() => {
        void ensureClientReportPdfReady({
            clientId: Number(clientId),
            projectId: Number(projectId),
            agentId: Number(agentId) || null,
            includeCover: true,
            includeSummary: true,
            goalTypes: null,
            fileNamePrefix: 'report',
            forceRegenerate,
            waitForResult: false,
        }).catch((err) => {
            console.warn('[ClientController] PDF warmup failed:', err.message || err);
        });
    });
}

class ClientController {
    // --- Existing Calculator ---
    async calculateFirstRun(req, res, next) {
        try {
            normalizeCalculationRequestBody(req.body);
            const validation = calculationRequestSchema.validate(req.body, { abortEarly: false, allowUnknown: true });
            if (validation.error) {
                const details = validation.error.details.map(d => ({
                    field: d.path.join('.'),
                    message: d.message,
                }));
                console.warn(
                    '[ClientController] calculateFirstRun validation failed',
                    JSON.stringify(details),
                    JSON.stringify(req.body).slice(0, 2500)
                );
                return res.status(400).json({
                    error: 'Validation error',
                    details,
                });
            }
            req.body = validation.value;

            if (!req.body.client) req.body.client = {};
            req.body.client.project_id = req.projectId || req.user?.projectId;

            if (!req.body.client.project_id) {
                return res.status(400).json({ error: 'Project context is missing' });
            }

            normalizeGuestCalculationPayload(req.body);

            const hasAssets = (req.body.client.assets?.length || req.body.assets?.length) > 0;
            const hasPool = Number(req.body.client.total_liquid_capital || 0) > 0;
            if (!hasAssets && !hasPool) {
                console.warn(
                    `[ClientController] calculateFirstRun: no client.assets/total_liquid_capital in request (project ${req.body.client.project_id})`
                );
            }

            console.log(`[ClientController] calculateFirstRun for project: ${req.body.client.project_id}`);

            let persistCtx = null;
            try {
                persistCtx = await prepareGuestLeadPersistence(req);
            } catch (persistErr) {
                if (persistErr?.status) {
                    return res.status(persistErr.status).json({ error: persistErr.message });
                }
                throw persistErr;
            }

            await attachCatalogAgentToClient(req);

            const result = await calculationService.calculateFirstRun(req.body, null, null, {
                isFirstRun: true,
                usePool: true,
                agentUserId: req.user?.id,
                agentId: req.body.client?.agent_id,
            });

            const persistMeta = await finishGuestLeadPersistence(req, result, persistCtx);
            const simplified = calculationService.simplify(result);
            if (persistMeta) {
                Object.assign(simplified, persistMeta);
                console.log(
                    `[ClientController] calculateFirstRun auto-saved lead client_id=${persistMeta.client_id}, ref=${req.body.ref || 'none'}`
                );
            }

            res.json(simplified);
        } catch (err) {
            next(err);
        }
    }

    /**
     * GET /client/risk-profile/questionnaire-v2 — guest-friendly questionnaire (public)
     */
    async getGuestRiskProfileQuestionnaireV2(req, res, next) {
        try {
            const projectId = req.projectId || req.user?.projectId || null;
            if (!projectId) {
                return res.status(400).json({ error: 'Project context is missing (x-project-key required)' });
            }
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
     * POST /client/risk-profile/evaluate — stateless risk scoring for guest CJM
     */
    async evaluateGuestRiskProfile(req, res, next) {
        try {
            const projectId = req.projectId || req.user?.projectId || null;
            if (!projectId) {
                return res.status(400).json({ error: 'Project context is missing (x-project-key required)' });
            }

            const validation = guestRiskEvaluateSchema.validate(req.body, {
                abortEarly: false,
                allowUnknown: true,
            });
            if (validation.error) {
                return res.status(400).json({
                    error: 'Validation error',
                    details: validation.error.details.map((d) => ({
                        field: d.path.join('.'),
                        message: d.message,
                    })),
                });
            }

            const questionnaire = await riskQuestionnaireService.getActiveQuestionnaire(projectId);
            if (!questionnaire) {
                return res.status(404).json({ error: 'Risk questionnaire is not configured' });
            }

            const normalizedAnswers = riskQuestionnaireService.normalizeAnswerMap(
                validation.value.risk_profile_answers,
                questionnaire
            );

            const goal = validation.value.goal || {};
            const clientData = validation.value.client || {};
            const riskProfileResult = await riskProfileService.calculateGoalProfile({
                answers: normalizedAnswers,
                goal,
                client: clientData,
                projectId,
            });

            let riskProfileExplanation = null;
            if (riskProfileResult) {
                const questionnaireV2 = await riskQuestionnaireService.getActiveQuestionnaireV2(projectId);
                riskProfileExplanation = await riskProfileExplanationService.build({
                    riskProfileResult,
                    answerMap: normalizedAnswers,
                    questionnaire: questionnaireV2,
                    projectId,
                    goalsPortfolioRisk: [],
                });
            }

            res.json({
                risk_profile_answers: normalizedAnswers,
                risk_questionnaire_version_id:
                    riskProfileResult?.questionnaire_version_id || questionnaire.id,
                risk_profile_result: riskProfileResult,
                risk_profile_explanation: riskProfileExplanation,
            });
        } catch (err) {
            next(err);
        }
    }

    // --- New Integrated Method (First Run / Onboarding) ---
    async firstRun(req, res, next) {
        try {
            // 1. Validation
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

            // 1.5 Inject Project ID (Strict enforcement)
            if (!req.body.client) req.body.client = {};
            req.body.client.project_id = req.projectId || req.user?.projectId;

            if (!req.body.client.project_id) {
                return res.status(400).json({ error: 'Project context is missing' });
            }

            console.log(`[ClientController] firstRun for project: ${req.body.client.project_id}`);

            await attachCatalogAgentToClient(req);

            // 2. Perform Calculation
            const calculationResponse = await calculationService.calculateFirstRun(req.body, null, null, {
                isFirstRun: true,
                usePool: true,
                agentUserId: req.user?.id,
                agentId: req.body.client?.agent_id,
            });

            const projectId = req.projectId || req.user?.projectId || req.body.client.project_id;
            const { clientId } = await persistCalculatedPlan(req.body, calculationResponse, projectId);

            calculationResponse.client_id = clientId;
            warmupClientPdfInBackground({
                clientId,
                projectId: req.body.client.project_id,
                agentId: req.user?.agentId || req.body.client?.agent_id || null,
                forceRegenerate: true,
            });
            res.json(calculationService.simplify(calculationResponse));
        } catch (err) {
            next(err);
        }
    }

    /**
     * Guest B2C: сохранить план без пароля, вернуть guest_token для отчётов.
     * POST /api/client/plan/save — публичный, x-project-key + ref.
     */
    async saveGuestPlan(req, res, next) {
        try {
            normalizeCalculationRequestBody(req.body);
            const validation = guestPlanSaveSchema.validate(req.body, { abortEarly: false, allowUnknown: true });
            if (validation.error) {
                return res.status(400).json({
                    error: 'Validation error',
                    details: validation.error.details.map((d) => ({
                        field: d.path.join('.'),
                        message: d.message,
                    })),
                });
            }

            if (!req.projectId) {
                return res.status(400).json({ error: 'Project context is missing (x-project-key)' });
            }

            let persistCtx;
            try {
                persistCtx = await prepareGuestLeadPersistence(req);
            } catch (persistErr) {
                if (persistErr?.status) {
                    return res.status(persistErr.status).json({ error: persistErr.message });
                }
                throw persistErr;
            }
            if (!persistCtx) {
                return res.status(400).json({ error: 'client.email is required for guest plan save' });
            }

            console.log(`[ClientController] saveGuestPlan for project: ${persistCtx.projectId}, ref: ${req.body.ref || 'none'}`);

            await attachCatalogAgentToClient(req);

            const calculationResponse = await calculationService.calculateFirstRun(req.body, null, null, {
                isFirstRun: true,
                usePool: true,
                agentId: req.body.client?.agent_id,
            });

            const persistMeta = await finishGuestLeadPersistence(req, calculationResponse, persistCtx);
            const simplified = calculationService.simplify(calculationResponse);
            res.json({ ...simplified, ...persistMeta });
        } catch (err) {
            next(err);
        }
    }

    /**
     * POST /api/client/ai-b2c/guest-session — публичный bootstrap /plan.
     * X-Project-Key + optional ref. Stub-лид + guest_token (тот же, что plan/save).
     */
    async createAiB2cGuestSession(req, res, next) {
        try {
            const ip = clientIpFromReq(req);
            if (!allowGuestSessionByIp(ip)) {
                return res.status(429).json({ error: 'Too many guest sessions' });
            }

            const validation = guestAiB2cSessionSchema.validate(req.body ?? {}, {
                abortEarly: false,
                allowUnknown: true,
            });
            if (validation.error) {
                return res.status(400).json({
                    error: 'Validation error',
                    details: validation.error.details.map((d) => ({
                        field: d.path.join('.'),
                        message: d.message,
                    })),
                });
            }

            const projectId = req.projectId;
            if (!projectId) {
                return res.status(400).json({ error: 'Project context is missing (x-project-key)' });
            }

            const ref = String(validation.value.ref || '').trim();
            let agentId = null;
            if (ref) {
                try {
                    const parentAgent = await agentNetworkService.resolveParentAgentFromRef(projectId, ref);
                    if (parentAgent) agentId = parentAgent.id;
                } catch (e) {
                    console.warn(
                        `[ClientController] ai-b2c guest-session skip invalid ref=${ref}: ${e?.message || e}`,
                    );
                }
            }

            const clientData = {
                project_id: projectId,
                first_name: ' ',
                last_name: ' ',
                agent_id: agentId,
            };
            if (agentId) {
                clientData.referred_by_agent_id =
                    await agentNetworkService.resolveReferredByAgentId(agentId);
            }

            const clientId = await clientRepository.create(clientData);
            const guestToken = authService.signGuestClientToken({
                clientId,
                projectId,
                email: null,
            });

            console.info(
                `[ClientController] ai-b2c guest-session client_id=${clientId} project_id=${projectId} ref=${ref || 'none'}`,
            );

            res.status(201).json({
                guest_token: guestToken,
                client_id: clientId,
            });
        } catch (err) {
            next(err);
        }
    }

    async calculateTaxPlanning(req, res, next) {
        try {
            const validation = taxPlanningRequestSchema.validate(req.body, { abortEarly: false, allowUnknown: true });
            if (validation.error) {
                return res.status(400).json({
                    error: 'Validation error',
                    details: validation.error.details.map(d => ({
                        field: d.path.join('.'),
                        message: d.message
                    }))
                });
            }
            const payload = validation.value;
            const projectId = req.projectId || req.user?.projectId || null;
            const result = await taxPlanningService.calculateExtendedTaxPlanning(payload, { projectId });
            return res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async create(req, res, next) {
        try {
            if (req.user && req.user.agentId) {
                if (!req.body.client) req.body.client = {};
                req.body.client.agent_id = req.user.agentId;
            }

            const clientId = await clientService.createFullClient(req.body);
            const fullClient = await clientService.getFullClient(clientId);
            res.status(201).json(calculationService.simplify(fullClient));
        } catch (err) {
            next(err);
        }
    }

    async listByAgent(req, res, next) {
        try {
            const agentId = req.user.agentId;
            const projectId = req.projectId || req.user?.projectId;
            if (!agentId) {
                return res.status(400).json({ error: 'Agent ID not found in token' });
            }

            const page = req.query.page || 1;
            // limit=0 или limit=all — вернуть всех клиентов без пагинации
            const rawLimit = req.query.limit;
            const limit = (rawLimit === '0' || rawLimit === 'all' || rawLimit === '') ? null : (parseInt(rawLimit, 10) || 50);
            const { sort, order, search } = req.query;

            const clients = await clientService.getClientsByAgent(agentId, projectId, { page, limit, sort, order, search });
            if (clients.data) {
                let data = clients.data.map((c) => attachCrmClientDates(calculationService.simplify(c)));

                const skipChatAi = req.query.include_chat_ai === '0' || req.query.include_chat_ai === 'false';
                if (!skipChatAi && data.length > 0) {
                    const rawLim = parseInt(req.query.chat_ai_limit, 10);
                    const chatAiLimit = Number.isFinite(rawLim) && rawLim > 0 ? Math.min(rawLim, 500) : 200;
                    const maxConstructorTurns = Math.max(1, Math.ceil(chatAiLimit / 2));
                    const ids = data.map((c) => c.id);
                    const [dialogMapAi, dialogMapSite, dialogMapConstructor] = await Promise.all([
                        aiB2cService.listChatAiDialogForClients(ids, chatAiLimit),
                        aiB2cService.listB2cSiteChatDialogForClients(ids, chatAiLimit),
                        constructorSiteChatAgentService.listConstructorSiteChatMessagesForPfpClients(ids, maxConstructorTurns)
                    ]);
                    data = data.map((c) => ({
                        ...c,
                        chat_ai_messages: dialogMapAi.get(Number(c.id)) || [],
                        b2c_site_chat_messages: dialogMapSite.get(Number(c.id)) || [],
                        constructor_site_chat_messages: dialogMapConstructor.get(Number(c.id)) || []
                    }));
                } else if (data.length > 0) {
                    data = data.map((c) => ({
                        ...c,
                        chat_ai_messages: [],
                        b2c_site_chat_messages: [],
                        constructor_site_chat_messages: []
                    }));
                }
                clients.data = data;
            }
            res.json(clients);
        } catch (err) {
            next(err);
        }
    }

    async get(req, res, next) {
        try {
            const { id } = req.params;
            const projectId = req.projectId || req.user?.projectId;
            const client = await clientService.getFullClient(id, projectId);
            if (!client) {
                return res.status(404).json({ error: 'Client not found' });
            }
            let payload = calculationService.simplify(client);
            warmupClientPdfInBackground({
                clientId: id,
                projectId,
                agentId: req.user?.agentId || client.agent_id || null,
            });
            const forceChatAi = req.query.include_chat_ai === 'true' || req.query.include_chat_ai === '1';
            const isAgentPlansRoute = req.route && req.route.path === '/:id/plans';
            const skipChatAi =
                (!forceChatAi && isAgentPlansRoute) ||
                req.query.include_chat_ai === '0' ||
                req.query.include_chat_ai === 'false';
            if (!skipChatAi) {
                const rawLim = parseInt(req.query.chat_ai_limit, 10);
                const chatAiLimit = Number.isFinite(rawLim) && rawLim > 0 ? Math.min(rawLim, 2000) : 500;
                const maxConstructorTurns = Math.max(1, Math.ceil(chatAiLimit / 2));
                const [chatAi, siteChat, constructorChat] = await Promise.all([
                    aiB2cService.listChatAiDialogForClient(id, chatAiLimit),
                    aiB2cService.listB2cSiteChatDialogForClient(id, chatAiLimit),
                    constructorSiteChatAgentService.listConstructorSiteChatMessagesForPfpClient(id, maxConstructorTurns)
                ]);
                payload = {
                    ...payload,
                    chat_ai_messages: chatAi,
                    b2c_site_chat_messages: siteChat,
                    constructor_site_chat_messages: constructorChat
                };
            } else {
                payload = {
                    ...payload,
                    chat_ai_messages: [],
                    b2c_site_chat_messages: [],
                    constructor_site_chat_messages: []
                };
            }
            res.json(payload);
        } catch (err) {
            next(err);
        }
    }

    /**
     * PUT /api/pfp/clients/:id — редактирование карточки клиента в ЛК агента.
     * PUT /api/client/:id — тот же handler (обратная совместимость).
     */
    async updateAgentClient(req, res, next) {
        try {
            const clientId = Number(req.params.id);
            if (!Number.isFinite(clientId) || clientId <= 0) {
                return res.status(400).json({ error: 'Invalid client id' });
            }

            const projectId = req.projectId || req.user?.projectId;
            const existing = await clientService.getFullClient(clientId, projectId);
            if (!existing) {
                return res.status(404).json({ error: 'Client not found' });
            }

            await assertAgentCanMutateClient({ req, client: existing, projectId });

            const validation = clientPatchRequestSchema.validate(req.body || {}, {
                abortEarly: false,
                stripUnknown: true,
            });
            if (validation.error) {
                return res.status(400).json({
                    error: 'Validation error',
                    details: validation.error.details.map((d) => ({
                        field: d.path.join('.'),
                        message: d.message,
                    })),
                });
            }

            await clientService.patchFullClient(clientId, validation.value, {
                existingClient: existing,
                projectId,
            });

            const wantRecalculate =
                req.query.recalculate === 'true' || req.query.recalculate === '1';
            if (wantRecalculate) {
                const calculationResponse = await this.runClientRecalculate(
                    clientId,
                    projectId,
                    req,
                    validation.value
                );
                return res.json(calculationService.simplify(calculationResponse));
            }

            const updated = await clientService.getFullClient(clientId, projectId);
            return res.json(calculationService.simplify(updated));
        } catch (err) {
            if (err.status) {
                return res.status(err.status).json({ error: err.message });
            }
            next(err);
        }
    }

    async update(req, res, next) {
        return this.updateAgentClient(req, res, next);
    }

    /**
     * Пересчёт финплана клиента (ядро для POST …/recalculate и PUT …?recalculate=true).
     * @param {{ forceSmartAllocation?: boolean }} [options]
     *   forceSmartAllocation — заново разложить client.total_liquid_capital по оставшимся целям
     *   (удаление/добавление цели). Обычный recalculate капитал не пересобирает.
     * @returns {Promise<object>} calculationResponse
     */
    async runClientRecalculate(clientId, projectId, req, body = {}, options = {}) {
        const forceSmartAllocation = options.forceSmartAllocation === true;
        const existingClient = await clientService.getFullClient(clientId, projectId);
        if (!existingClient) {
            const err = new Error('Client not found');
            err.status = 404;
            throw err;
        }

        await assertAgentCanMutateClient({ req, client: existingClient, projectId });

        const reqBody = body && typeof body === 'object' ? body : {};

            // 2. Prepare goals map from DB
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
            let goalsToCalculate = [];
            let explicitManualRiskForTarget = false;

            // 3. Handle Updates (Bulk or Single)
            if (!reqBody.goals || reqBody.goals.length === 0) {
                // Check for single goal update format: { goal_id: "...", target_amount: 100, ... }
                const singleGoalId = reqBody.goal_id || reqBody.id;

                if (singleGoalId && goalsMap.has(String(singleGoalId))) {
                    console.log(`[ClientController] Using GoalRecalculator for single goal: ${singleGoalId}`);
                    const existing = goalsMap.get(String(singleGoalId));
                    const preparedPatch = { ...reqBody };
                    if (shouldForceReverseModeForPatch(existing, preparedPatch)) {
                        preparedPatch.monthly_replenishment = null;
                    }
                    const updated = goalRecalculator.prepare(existing, preparedPatch);
                    explicitManualRiskForTarget = patchHasExplicitManualGoalRisk(preparedPatch);
                    applyManualGoalRiskSanitize(updated, preparedPatch);

                    goalsMap.set(String(singleGoalId), updated);
                    identifiedTargetId = String(singleGoalId);
                } else {
                    console.log('[ClientController] No goals provided, recalculating current state');
                }
                goalsToCalculate = Array.from(goalsMap.values());
            } else {
                // Bulk updates in goals array
                reqBody.goals.forEach(patch => {
                    const incomingId = patch.id || patch.goal_id;
                    let matchKey = incomingId ? String(incomingId) : null;

                    if (matchKey && goalsMap.has(matchKey)) {
                        const existing = goalsMap.get(matchKey);
                        const preparedPatch = { ...patch };
                        if (shouldForceReverseModeForPatch(existing, preparedPatch)) {
                            preparedPatch.monthly_replenishment = null;
                        }
                        const updated = goalRecalculator.prepare(existing, preparedPatch);
                        if (reqBody.goals.length === 1) {
                            explicitManualRiskForTarget = patchHasExplicitManualGoalRisk(preparedPatch);
                        }
                        applyManualGoalRiskSanitize(updated, preparedPatch);
                        goalsMap.set(matchKey, updated);
                        if (reqBody.goals.length === 1) identifiedTargetId = matchKey;
                    } else {
                        // For new goals in the array, use default preparation if possible
                        const key = matchKey || `temp_${Date.now()}_${Math.random()}`;
                        goalsMap.set(key, patch);
                        if (reqBody.goals.length === 1) identifiedTargetId = key;
                    }
                });
                goalsToCalculate = Array.from(goalsMap.values());
            }

            // 4. Merge Client Data
            const clientForCalc = {
                ...existingClient,
                ...reqBody.client,
                assets: reqBody.client?.assets || existingClient.assets || [],
                total_liquid_capital: reqBody.client?.total_liquid_capital !== undefined
                    ? reqBody.client.total_liquid_capital
                    : (existingClient.total_liquid_capital !== undefined ? Number(existingClient.total_liquid_capital) : (existingClient.assets_total || 0))
            };

            // 4.5 Inject Project ID (Strict enforcement)
            clientForCalc.project_id = projectId;
            clientForCalc.agent_id = existingClient.agent_id || req.user?.agentId || clientForCalc.agent_id;
            if (reqBody.client) reqBody.client.project_id = projectId;

            if (!projectId) {
                const err = new Error('Project context missing during recalculation');
                err.status = 400;
                throw err;
            }

            // 5. Run Calculation
            const calcRequest = { client: clientForCalc, goals: goalsToCalculate };
            let previousCalculation = null;
            try {
                previousCalculation = typeof existingClient.goals_summary === 'string'
                    ? JSON.parse(existingClient.goals_summary)
                    : existingClient.goals_summary;
            } catch (e) { }

            if (forceSmartAllocation) {
                console.log('[ClientController] Recalculate with full Smart Allocation (goal add/delete)');
            }

            const calculationResponse = await calculationService.calculateFirstRun(
                calcRequest,
                forceSmartAllocation ? null : identifiedTargetId,
                forceSmartAllocation ? null : previousCalculation,
                {
                    isFirstRun: forceSmartAllocation,
                    usePool: forceSmartAllocation,
                    agentUserId: req.user?.id,
                    agentId: clientForCalc.agent_id,
                    explicitManualRiskForTarget: forceSmartAllocation ? false : explicitManualRiskForTarget,
                }
            );

            // 6. Persistence
            const numericClientId = Number(existingClient.id);
            const calculation = calculationResponse.calculation || calculationResponse;

            if (forceSmartAllocation) {
                const calculatedGoals = calculation?.goals || [];
                for (const g of goalsToCalculate) {
                    const gid = g.id || g.goal_id;
                    if (!gid) continue;
                    const calcG = calculatedGoals.find((goalResult) =>
                        String(goalResult?.goal_id || goalResult?.id || '') === String(gid)
                    );
                    const cap = Number(calcG?.summary?.initial_capital ?? g.smart_initial_capital);
                    if (!Number.isFinite(cap)) continue;
                    await clientService.updateGoal(numericClientId, gid, { initial_capital: cap });
                }
                console.log(`[ClientController] Persisted redistributed initial_capital for ${goalsToCalculate.length} goals`);
            } else if (identifiedTargetId && !identifiedTargetId.startsWith('temp_')) {
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

                        // Keep dual fields in sync for monthly-income goals in forward mode.
                        if (goalTypeId === 1 || goalTypeId === 2) {
                            updatedGoalData.desired_monthly_income = Number(summary.target_amount_initial || 0);
                        }
                    }
                }

                await clientService.updateGoal(numericClientId, identifiedTargetId, updatedGoalData);
                console.log(`[ClientController] Persisted changes to goal ${identifiedTargetId}`);
            } else if (!reqBody.goals || reqBody.goals.length > 0) {
                // Bulk update / new goals
                await clientService.updateFullClient(numericClientId, { client: clientForCalc, goals: goalsToCalculate });
            }

            // 7. SYNC IDs (especially for new goals with temp IDs)
            await syncCalculationGoalsWithDatabase(numericClientId, calculation);

            // Save Snapshot
            await clientService.persistGoalsSummary(numericClientId, calculationResponse, projectId);

            // Recalculate changes goal numbers used by PDF pages.
            // Force background regeneration to avoid returning stale cached PDF URL/content.
            warmupClientPdfInBackground({
                clientId: numericClientId,
                projectId,
                agentId: req.user?.agentId || existingClient.agent_id || null,
                forceRegenerate: true,
            });

            calculationResponse.client_id = numericClientId;
            return calculationResponse;
    }

    async recalculate(req, res, next) {
        try {
            const clientId = Number(req.params.id);
            const projectId = req.projectId || req.user?.projectId;
            const calculationResponse = await this.runClientRecalculate(
                clientId,
                projectId,
                req,
                req.body || {}
            );
            res.json(calculationService.simplify(calculationResponse));
        } catch (err) {
            if (err.status) {
                return res.status(err.status).json({ error: err.message });
            }
            next(err);
        }
    }

    async addGoal(req, res, next) {
        try {
            const { id } = req.params;
            await clientService.addGoal(id, req.body);
            const projectId = req.projectId != null ? req.projectId : req.user?.projectId;
            const calculationResponse = await this.runClientRecalculate(
                id,
                projectId,
                req,
                { goals: [] },
                { forceSmartAllocation: true }
            );
            return res.json(calculationService.simplify(calculationResponse));
        } catch (err) {
            next(err);
        }
    }

    async deleteGoal(req, res, next) {
        try {
            const { id, goalId } = req.params;
            const projectId = req.projectId != null ? req.projectId : req.user?.projectId;
            const existingClient = await clientService.getFullClient(id, projectId);
            if (!existingClient) {
                return res.status(404).json({ error: 'Client not found' });
            }
            await assertAgentCanMutateClient({ req, client: existingClient, projectId });
            await clientService.deleteGoal(id, goalId);
            const calculationResponse = await this.runClientRecalculate(
                id,
                projectId,
                req,
                { goals: [] },
                { forceSmartAllocation: true }
            );
            return res.json(calculationService.simplify(calculationResponse));
        } catch (err) {
            next(err);
        }
    }

    /**
     * POST /api/pfp/clients/nda/send — NDA до first-run: клиента в БД нет, тело как у sendNda.
     */
    async sendNdaStandalone(req, res, next) {
        try {
            console.log('[clientController] POST /pfp/clients/nda/send');
            const validation = sendNdaSchema.validate(req.body || {}, { stripUnknown: true });
            if (validation.error) {
                return res.status(400).json({ error: validation.error.details[0].message });
            }

            const agentId = req.user?.agentId;
            if (!agentId) {
                return res.status(403).json({ error: 'Доступно только агенту' });
            }

            const projectId = req.projectId != null ? req.projectId : req.user?.projectId;

            const result = await ndaService.generateAndSendNdaStandalone({
                agentUserId: Number(agentId),
                projectId: projectId != null ? Number(projectId) : null,
                clientEmail: validation.value.client_email,
                clientFullName: validation.value.client_full_name,
                clientPhone: validation.value.client_phone,
                clientBirthDate: validation.value.client_birth_date,
                clientGender: validation.value.client_gender,
            });

            res.json(result);
        } catch (err) {
            next(err);
        }
    }

    /**
     * POST /api/pfp/clients/:id/nda/send (см. agentClientRoutes; только agent/admin/super_admin)
     * Сформировать NDA (PDF), отправить на client_email из тела, вернуть pdf_base64.
     */
    async sendNda(req, res, next) {
        try {
            console.log(`[clientController] POST /pfp/clients/${req.params.id}/nda/send`);
            const validation = sendNdaSchema.validate(req.body || {}, { stripUnknown: true });
            if (validation.error) {
                return res.status(400).json({ error: validation.error.details[0].message });
            }

            const agentId = req.user?.agentId;
            if (!agentId) {
                return res.status(403).json({ error: 'Доступно только агенту' });
            }

            const projectId = req.projectId != null ? req.projectId : req.user?.projectId;
            const clientId = Number(req.params.id);
            if (!Number.isFinite(clientId)) {
                return res.status(400).json({ error: 'Некорректный id клиента' });
            }

            const result = await ndaService.generateAndSendNda({
                clientId,
                agentUserId: Number(agentId),
                projectId: projectId != null ? Number(projectId) : null,
                clientEmail: validation.value.client_email,
                clientFullName: validation.value.client_full_name,
                clientPhone: validation.value.client_phone,
                clientBirthDate: validation.value.client_birth_date,
                clientGender: validation.value.client_gender,
            });

            res.json(result);
        } catch (err) {
            next(err);
        }
    }

    /**
     * POST /api/pfp/clients/:id/life-insurance/send-email
     * Отправка клиенту письма с кнопкой открытия «Подушки безопасности».
     */
    async sendLifeInsuranceOfferEmail(req, res, next) {
        try {
            const validation = sendLifeOfferSchema.validate(req.body || {}, { stripUnknown: true });
            if (validation.error) {
                return res.status(400).json({ error: validation.error.details[0].message });
            }

            const clientId = Number(req.params.id);
            if (!Number.isFinite(clientId)) {
                return res.status(400).json({ error: 'Некорректный id клиента' });
            }

            const projectId = req.projectId != null ? Number(req.projectId) : Number(req.user?.projectId);
            const client = await clientService.getFullClient(clientId, projectId);
            if (!client) {
                return res.status(404).json({ error: 'Клиент не найден' });
            }

            const role = String(req.user?.role || '').toLowerCase();
            const isAdmin = role === 'admin' || role === 'super_admin';
            if (!isAdmin) {
                const requesterAgentId = Number(req.user?.agentId);
                const ownerAgentId = Number(client?.agent_id);
                if (!Number.isFinite(requesterAgentId) || requesterAgentId <= 0 || requesterAgentId !== ownerAgentId) {
                    return res.status(403).json({ error: 'Доступ запрещён' });
                }
            }

            const recipient = String(client.email || '').trim();
            if (!recipient) {
                return res.status(400).json({ error: 'У клиента не заполнен email в карточке' });
            }

            let emailAgentId =
                Number.isFinite(Number(req.user?.agentId)) && Number(req.user.agentId) > 0
                    ? Number(req.user.agentId)
                    : null;
            if (!emailAgentId && Number.isFinite(Number(client.agent_id))) {
                emailAgentId = Number(client.agent_id);
            }
            if (!emailAgentId) {
                return res.status(400).json({ error: 'Нет агента для отправки письма' });
            }

            const agent = await agentService.getAgentById(emailAgentId, projectId);
            if (!agent) {
                return res.status(404).json({ error: 'Agent not found' });
            }

            const lifeOfferPayload = resolveLifeOfferEmailPayload(projectId, {
                offerUrl: validation.value.offer_url,
                shortDescription: validation.value.short_description,
            });
            const emailResult = await emailService.sendSberLifeOfferEmail({
                to: recipient,
                clientFullName: String(client.fio || '').trim() || 'клиент',
                clientGender: normalizeClientGender(client.gender || client.sex),
                agentFullName: buildAgentDisplayFullName(agent),
                agentEmail: (agent.email && String(agent.email).trim()) || '—',
                agentPhone: (agent.phone && String(agent.phone).trim()) || '—',
                reportAgent: { id: agent.id, email: agent.email, email_corp: agent.email_corp },
                offerUrl: lifeOfferPayload.offerUrl,
                shortDescription: lifeOfferPayload.shortDescription,
            });

            return res.json({
                ok: true,
                message_id: emailResult?.id || null,
                client_email: recipient,
                offer_url: lifeOfferPayload.offerUrl,
            });
        } catch (err) {
            next(err);
        }
    }

    /**
     * POST /api/pfp/clients/:id/broker-account/send-email
     * Отправка клиенту письма с открытием брокерского счёта Финам.
     */
    async sendBrokerAccountOfferEmail(req, res, next) {
        try {
            const validation = sendBrokerOfferSchema.validate(req.body || {}, { stripUnknown: true });
            if (validation.error) {
                return res.status(400).json({ error: validation.error.details[0].message });
            }

            const clientId = Number(req.params.id);
            if (!Number.isFinite(clientId)) {
                return res.status(400).json({ error: 'Некорректный id клиента' });
            }

            const projectId = req.projectId != null ? Number(req.projectId) : Number(req.user?.projectId);
            const client = await clientService.getFullClient(clientId, projectId);
            if (!client) {
                return res.status(404).json({ error: 'Клиент не найден' });
            }

            const role = String(req.user?.role || '').toLowerCase();
            const isAdmin = role === 'admin' || role === 'super_admin';
            if (!isAdmin) {
                const requesterAgentId = Number(req.user?.agentId);
                const ownerAgentId = Number(client?.agent_id);
                if (!Number.isFinite(requesterAgentId) || requesterAgentId <= 0 || requesterAgentId !== ownerAgentId) {
                    return res.status(403).json({ error: 'Доступ запрещён' });
                }
            }

            const recipient = String(client.email || '').trim();
            if (!recipient) {
                return res.status(400).json({ error: 'У клиента не заполнен email в карточке' });
            }

            let emailAgentId =
                Number.isFinite(Number(req.user?.agentId)) && Number(req.user.agentId) > 0
                    ? Number(req.user.agentId)
                    : null;
            if (!emailAgentId && Number.isFinite(Number(client.agent_id))) {
                emailAgentId = Number(client.agent_id);
            }
            if (!emailAgentId) {
                return res.status(400).json({ error: 'Нет агента для отправки письма' });
            }

            const agent = await agentService.getAgentById(emailAgentId, projectId);
            if (!agent) {
                return res.status(404).json({ error: 'Agent not found' });
            }

            const { loadAgentWithParent } = require('../services/agentPartnerIdWizardService');
            const { agentForPartnerTracking } = require('../utils/effectivePartnerAgent');
            const { parentAgent } = await loadAgentWithParent(emailAgentId, projectId);

            const project = await projectService.getProjectById(projectId);
            const projectSettings = parseProjectSettings(project?.settings);
            const emailLinkOpts = {
                agent: agentForPartnerTracking(agent, parentAgent),
                projectSettings,
                clientId,
                paramOverrides: { utm_medium: 'email' },
            };

            const openUrl = buildTrackedPartnerUrl(
                validation.value.open_url || 'https://www.finam.ru/open/order/russia/',
                { ...emailLinkOpts, linkType: 'broker_open' }
            );
            const promoBonusUrl = buildTrackedPartnerUrl('https://bonus.finam.ru/2025/', {
                ...emailLinkOpts,
                linkType: 'bonus',
            });
            const promoTransferUrl = buildTrackedPartnerUrl(
                'https://broker.finam.ru/landing/vygodniy-perekhod/',
                { ...emailLinkOpts, linkType: 'transfer' }
            );

            const emailResult = await emailService.sendFinamBrokerOfferEmail({
                to: recipient,
                clientFullName: String(client.fio || '').trim() || 'клиент',
                clientGender: normalizeClientGender(client.gender || client.sex),
                agentFullName: buildAgentDisplayFullName(agent),
                agentEmail: (agent.email && String(agent.email).trim()) || '—',
                agentPhone: (agent.phone && String(agent.phone).trim()) || '—',
                reportAgent: { id: agent.id, email: agent.email, email_corp: agent.email_corp },
                openUrl,
                promoBonusUrl,
                promoTransferUrl,
                shortDescription: validation.value.short_description,
            });

            if (agent.parent_agent_id) {
                commissionService
                    .recordCommissionEvent({
                        projectId,
                        eventType: 'broker_email_sent',
                        agentId: emailAgentId,
                        beneficiaryAgentId: Number(agent.parent_agent_id),
                        clientId,
                    })
                    .catch((err) =>
                        console.error('[ClientController] commission broker_email_sent failed:', err)
                    );
            }

            return res.json({
                ok: true,
                message_id: emailResult?.id || null,
                client_email: recipient,
                open_url: openUrl,
                promo_urls: {
                    bonus: promoBonusUrl,
                    transfer: promoTransferUrl,
                },
            });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new ClientController();
