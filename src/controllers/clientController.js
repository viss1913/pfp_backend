const calculationService = require('../services/calculationService');
const Joi = require('joi');

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
        risk_profile: Joi.string().valid('CONSERVATIVE', 'BALANCED', 'AGGRESSIVE').required()
            .description('Риск-профиль: CONSERVATIVE, BALANCED или AGGRESSIVE'),
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
            .description('Данные застрахованного лица (если отличается от страхователя)')
    }).optional()
        .description('Данные клиента (опционально, но рекомендуется для расчета НСЖ и Пенсии)')
});

const clientService = require('../services/clientService');
const goalRecalculator = require('../services/recalculators');

class ClientController {
    async _syncGoalsWithDatabase(clientId, calculation) {
        if (!calculation || !calculation.goals) return;

        const dbGoals = await clientService.getFullClient(clientId);
        if (!dbGoals || !dbGoals.goals) return;

        calculation.goals.forEach(calcGoal => {
            // Find match in DB goals by name and type
            const match = dbGoals.goals.find(dg =>
                String(dg.name).trim() === String(calcGoal.goal_name || calcGoal.name).trim() &&
                Number(dg.goal_type_id) === Number(calcGoal.goal_type_id)
            );

            if (match) {
                calcGoal.goal_id = match.id;
                calcGoal.id = match.id;
            }
        });
    }

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

            const result = await calculationService.calculateFirstRun(req.body);
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
            const calculationResponse = await calculationService.calculateFirstRun(req.body, null, null, { isFirstRun: true, usePool: true });
            const calculation = calculationResponse.calculation || calculationResponse;

            // 3. Inject Agent ID
            if (req.user && req.user.agentId) {
                if (!req.body.client) req.body.client = {};
                req.body.client.agent_id = req.user.agentId;
            }

            // 4. Save/Update Profile
            const clientId = await clientService.createFullClient(req.body);

            // 5. SYNC IDs: Update calculation goals with real DB IDs
            await this._syncGoalsWithDatabase(clientId, calculation);

            // Save Calculation Snapshot to Client record (with real IDs)
            await clientService.updateClient(clientId, {
                goals_summary: JSON.stringify(calculationResponse)
            });

            calculationResponse.client_id = clientId;
            res.json(calculationService.simplify(calculationResponse));
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
            const limit = req.query.limit || 50;
            const { sort, order, search } = req.query;

            const clients = await clientService.getClientsByAgent(agentId, projectId, { page, limit, sort, order, search });
            if (clients.data) {
                clients.data = clients.data.map(c => calculationService.simplify(c));
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
            res.json(calculationService.simplify(client));
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
                const numericFields = ['target_amount', 'initial_capital', 'term_months', 'monthly_replenishment', 'priority', 'goal_type_id', 'desired_monthly_income', 'id', 'goal_id'];
                numericFields.forEach(field => {
                    if (parsed[field] !== undefined && parsed[field] !== null) parsed[field] = Number(parsed[field]);
                });
                return parsed;
            });

            const goalsMap = new Map();
            existingGoals.forEach(g => { if (g.id) goalsMap.set(String(g.id), g); });

            let identifiedTargetId = null;
            let goalsToCalculate = [];

            // 3. Handle Updates (Bulk or Single)
            if (!req.body.goals || req.body.goals.length === 0) {
                // Check for single goal update format: { goal_id: "...", target_amount: 100, ... }
                const singleGoalId = req.body.goal_id || req.body.id;

                if (singleGoalId && goalsMap.has(String(singleGoalId))) {
                    console.log(`[ClientController] Using GoalRecalculator for single goal: ${singleGoalId}`);
                    const existing = goalsMap.get(String(singleGoalId));
                    const updated = goalRecalculator.prepare(existing, req.body);

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
                        const updated = goalRecalculator.prepare(existing, patch);
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
                { isFirstRun: false, usePool: false }
            );

            // 6. Persistence
            const clientId = existingClient.id;
            const calculation = calculationResponse.calculation || calculationResponse;

            if (identifiedTargetId && !identifiedTargetId.startsWith('temp_')) {
                const updatedGoalData = goalsMap.get(identifiedTargetId);
                await clientService.updateGoal(clientId, identifiedTargetId, updatedGoalData);
                console.log(`[ClientController] Persisted changes to goal ${identifiedTargetId}`);
            } else if (!req.body.goals || req.body.goals.length > 0) {
                // Bulk update / new goals
                await clientService.updateFullClient(clientId, { client: clientForCalc, goals: goalsToCalculate });
            }

            // 7. SYNC IDs (especially for new goals with temp IDs)
            await this._syncGoalsWithDatabase(clientId, calculation);

            // Save Snapshot
            await clientService.updateClient(clientId, {
                goals_summary: JSON.stringify(calculationResponse)
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
}

module.exports = new ClientController();
