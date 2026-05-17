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
        assets: Joi.array().items(Joi.object({
            type: Joi.string().required(),
            amount: Joi.number().min(0).optional(),
            current_value: Joi.number().min(0).optional(),
            unlock_month: Joi.number().integer().min(0).optional(),
            sell_month: Joi.number().integer().min(0).optional(),
            name: Joi.string().optional(),
            goal_id: Joi.string().allow(null).optional()
        })).optional().default([])
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
const { parseProjectSettings } = require('../utils/projectSettings');
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
            // Валидация входных данных
            const validation = calculationRequestSchema.validate(req.body, { abortEarly: false });
            if (validation.error) {
                return res.status(400).json({
                    error: 'Validation error',
                    details: validation.error.details.map(d => ({
                        field: d.path.join('.'),
                        message: d.message
                    }))
                });
            }

            if (!req.body.client) req.body.client = {};
            // Strict scoping: priority to validated projectId from context/token
            req.body.client.project_id = req.projectId || req.user?.projectId;

            if (!req.body.client.project_id) {
                return res.status(400).json({ error: 'Project context is missing' });
            }

            console.log(`[ClientController] calculateFirstRun for project: ${req.body.client.project_id}`);

            const result = await calculationService.calculateFirstRun(req.body, null, null, {
                agentUserId: req.user?.id
            });
            res.json(calculationService.simplify(result));
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

            // 2. Perform Calculation
            const calculationResponse = await calculationService.calculateFirstRun(req.body, null, null, {
                isFirstRun: true,
                usePool: true,
                agentUserId: req.user?.id
            });
            const calculation = calculationResponse.calculation || calculationResponse;

            // 3. Inject Agent ID
            if (req.user && req.user.agentId) {
                if (!req.body.client) req.body.client = {};
                req.body.client.agent_id = req.user.agentId;
            }

            // 4. Save/Update Profile
            const clientId = await clientService.createFullClient(req.body);

            // 5. SYNC IDs: Update calculation goals with real DB IDs
            await syncCalculationGoalsWithDatabase(clientId, calculation);

            // Save Calculation Snapshot to Client record (with real IDs)
            await clientService.updateClient(clientId, {
                goals_summary: JSON.stringify(calculationResponse)
            });

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
                let data = clients.data.map((c) => calculationService.simplify(c));

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

    async update(req, res, next) {
        try {
            const { id } = req.params;
            const agentId = req.user.agentId;
            const projectId = req.projectId || req.user?.projectId;

            const existing = await clientService.getFullClient(id, projectId);
            if (!existing || (existing.agent_id && existing.agent_id != agentId)) {
                return res.status(404).json({ error: 'Client not found or access denied' });
            }

            await clientService.updateFullClient(id, req.body);
            const updated = await clientService.getFullClient(id, projectId);
            res.json(calculationService.simplify(updated));
        } catch (err) {
            next(err);
        }
    }

    async recalculate(req, res, next) {
        try {
            const { id } = req.params;
            const agentId = req.user.agentId;
            const projectId = req.projectId || req.user?.projectId;

            // 1. Fetch Existing Client Data
            const existingClient = await clientService.getFullClient(id, projectId);
            if (!existingClient) {
                return res.status(404).json({ error: 'Client not found' });
            }
            if (existingClient.agent_id && existingClient.agent_id != agentId) {
                return res.status(403).json({ error: 'Access denied' });
            }

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
            if (!req.body.goals || req.body.goals.length === 0) {
                // Check for single goal update format: { goal_id: "...", target_amount: 100, ... }
                const singleGoalId = req.body.goal_id || req.body.id;

                if (singleGoalId && goalsMap.has(String(singleGoalId))) {
                    console.log(`[ClientController] Using GoalRecalculator for single goal: ${singleGoalId}`);
                    const existing = goalsMap.get(String(singleGoalId));
                    const preparedPatch = { ...req.body };
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
                req.body.goals.forEach(patch => {
                    const incomingId = patch.id || patch.goal_id;
                    let matchKey = incomingId ? String(incomingId) : null;

                    if (matchKey && goalsMap.has(matchKey)) {
                        const existing = goalsMap.get(matchKey);
                        const preparedPatch = { ...patch };
                        if (shouldForceReverseModeForPatch(existing, preparedPatch)) {
                            preparedPatch.monthly_replenishment = null;
                        }
                        const updated = goalRecalculator.prepare(existing, preparedPatch);
                        if (req.body.goals.length === 1) {
                            explicitManualRiskForTarget = patchHasExplicitManualGoalRisk(preparedPatch);
                        }
                        applyManualGoalRiskSanitize(updated, preparedPatch);
                        goalsMap.set(matchKey, updated);
                        if (req.body.goals.length === 1) identifiedTargetId = matchKey;
                    } else {
                        // For new goals in the array, use default preparation if possible
                        const key = matchKey || `temp_${Date.now()}_${Math.random()}`;
                        goalsMap.set(key, patch);
                        if (req.body.goals.length === 1) identifiedTargetId = key;
                    }
                });
                goalsToCalculate = Array.from(goalsMap.values());
            }

            // 4. Merge Client Data
            const clientForCalc = {
                ...existingClient,
                ...req.body.client,
                assets: req.body.client?.assets || existingClient.assets || [],
                total_liquid_capital: req.body.client?.total_liquid_capital !== undefined
                    ? req.body.client.total_liquid_capital
                    : (existingClient.total_liquid_capital !== undefined ? Number(existingClient.total_liquid_capital) : (existingClient.assets_total || 0))
            };

            // 4.5 Inject Project ID (Strict enforcement)
            clientForCalc.project_id = projectId;
            if (req.body.client) req.body.client.project_id = projectId;

            if (!projectId) {
                return res.status(400).json({ error: 'Project context missing during recalculation' });
            }

            // 5. Run Calculation
            const calcRequest = { client: clientForCalc, goals: goalsToCalculate };
            let previousCalculation = null;
            try {
                previousCalculation = typeof existingClient.goals_summary === 'string'
                    ? JSON.parse(existingClient.goals_summary)
                    : existingClient.goals_summary;
            } catch (e) { }

            const calculationResponse = await calculationService.calculateFirstRun(
                calcRequest,
                identifiedTargetId,
                previousCalculation,
                {
                    isFirstRun: false,
                    usePool: false,
                    agentUserId: req.user?.id,
                    explicitManualRiskForTarget,
                }
            );

            // 6. Persistence
            const clientId = existingClient.id;
            const calculation = calculationResponse.calculation || calculationResponse;

            if (identifiedTargetId && !identifiedTargetId.startsWith('temp_')) {
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

                await clientService.updateGoal(clientId, identifiedTargetId, updatedGoalData);
                console.log(`[ClientController] Persisted changes to goal ${identifiedTargetId}`);
            } else if (!req.body.goals || req.body.goals.length > 0) {
                // Bulk update / new goals
                await clientService.updateFullClient(clientId, { client: clientForCalc, goals: goalsToCalculate });
            }

            // 7. SYNC IDs (especially for new goals with temp IDs)
            await syncCalculationGoalsWithDatabase(clientId, calculation);

            // Save Snapshot
            await clientService.updateClient(clientId, {
                goals_summary: JSON.stringify(calculationResponse)
            });

            // Recalculate changes goal numbers used by PDF pages.
            // Force background regeneration to avoid returning stale cached PDF URL/content.
            warmupClientPdfInBackground({
                clientId,
                projectId,
                agentId: req.user?.agentId || existingClient.agent_id || null,
                forceRegenerate: true,
            });

            res.json(calculationService.simplify(calculationResponse));

        } catch (err) {
            next(err);
        }
    }

    async addGoal(req, res, next) {
        try {
            const { id } = req.params;
            await clientService.addGoal(id, req.body);
            if (!req.body) req.body = {};
            req.body.goals = null;
            return this.recalculate(req, res, next);
        } catch (err) {
            next(err);
        }
    }

    async deleteGoal(req, res, next) {
        try {
            const { id, goalId } = req.params;
            await clientService.deleteGoal(id, goalId);
            if (!req.body) req.body = {};
            req.body.goals = null;
            return this.recalculate(req, res, next);
        } catch (err) {
            next(err);
        }
    }

    /**
     * POST /api/pfp/clients/nda/send — NDA до first-run: клиента в БД нет, тело как у sendNda.
     */
    async sendNdaStandalone(req, res, next) {
        try {
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

            const offerUrl = validation.value.offer_url || 'https://sberbank-insurance.ru/podushka-bezopasnosti';
            const emailResult = await emailService.sendSberLifeOfferEmail({
                to: recipient,
                clientFullName: String(client.fio || '').trim() || 'клиент',
                clientGender: normalizeClientGender(client.gender || client.sex),
                agentFullName: buildAgentDisplayFullName(agent),
                agentEmail: (agent.email && String(agent.email).trim()) || '—',
                agentPhone: (agent.phone && String(agent.phone).trim()) || '—',
                reportAgent: { id: agent.id, email: agent.email, email_corp: agent.email_corp },
                offerUrl,
                shortDescription: validation.value.short_description,
            });

            return res.json({
                ok: true,
                message_id: emailResult?.id || null,
                client_email: recipient,
                offer_url: offerUrl,
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
