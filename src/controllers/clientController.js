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

            const result = await calculationService.calculateFirstRun(req.body);
            res.json(result);
        } catch (err) {
            next(err);
        }
    }

    // --- New Integrated Method (First Run / Onboarding) ---
    async firstRun(req, res, next) {
        try {
            // 1. Validation (Reuse existing schema for calculation parts, but full request has assets/etc)
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

            // 2. Perform Calculation (This may inject "Smart" goals into req.body.goals)
            const calculation = await calculationService.calculateFirstRun(req.body);

            // 3. Inject Agent ID if authenticated
            if (req.user && req.user.agentId) {
                if (!req.body.client) req.body.client = {};
                req.body.client.agent_id = req.user.agentId;
            }

            // 4. Save/Update Profile (Now include injected goals)
            const clientId = await clientService.createFullClient(req.body);

            // 4. Save Calculation Snapshot to Client record for Agent/Consultant
            await clientService.updateClient(clientId, {
                goals_summary: JSON.stringify(calculation)
            });

            // 5. Return combined result
            res.status(200).json({
                client_id: clientId,
                calculation: calculation
            });
        } catch (err) {
            next(err);
        }
    }

    async create(req, res, next) {
        try {
            // Basic Joi validation for structure could be here
            // For now passing directly to service
            if (req.user && req.user.agentId) {
                if (!req.body.client) req.body.client = {};
                req.body.client.agent_id = req.user.agentId;
            }

            const clientId = await clientService.createFullClient(req.body);
            const fullClient = await clientService.getFullClient(clientId);
            res.status(201).json(fullClient);
        } catch (err) {
            next(err);
        }
    }

    async listByAgent(req, res, next) {
        try {
            const agentId = req.user.agentId;
            if (!agentId) {
                return res.status(400).json({ error: 'Agent ID not found in token' });
            }

            // Extract query params for pagination/sorting if needed
            const page = req.query.page || 1;
            const limit = req.query.limit || 50;
            const { sort, order, search } = req.query;

            const clients = await clientService.getClientsByAgent(agentId, { page, limit, sort, order, search });
            res.json(clients);
        } catch (err) {
            next(err);
        }
    }

    async get(req, res, next) {
        try {
            const { id } = req.params;
            const client = await clientService.getFullClient(id);
            if (!client) {
                return res.status(404).json({ error: 'Client not found' });
            }
            res.json(client);
        } catch (err) {
            next(err);
        }
    }

    async update(req, res, next) {
        try {
            const { id } = req.params;
            const agentId = req.user.agentId;

            // Optional: check if client belongs to agent
            const existing = await clientService.getFullClient(id);
            if (!existing || existing.agent_id != agentId) {
                return res.status(404).json({ error: 'Client not found or access denied' });
            }

            await clientService.updateFullClient(id, req.body);
            const updated = await clientService.getFullClient(id);
            res.json(updated);
        } catch (err) {
            next(err);
        }
    }

    async recalculate(req, res, next) {
        try {
            const { id } = req.params;
            const agentId = req.user.agentId;

            // 1. Fetch Existing Client Data
            const existingClient = await clientService.getFullClient(id);
            if (!existingClient) {
                return res.status(404).json({ error: 'Client not found' });
            }
            if (existingClient.agent_id && existingClient.agent_id != agentId) {
                return res.status(403).json({ error: 'Access denied' });
            }

            // 2. Merge Updates from Request Body
            // Allow updating goals, assets, or basic client info (income, etc)

            // 2. Merge Updates from Request Body
            // Goals: Merge logic instead of overwrite
            let goalsToCalculate = [];

            // Normalize existing goals (unpack params from JSON string/object if needed)
            // This is crucial because calculationService expects flat properties, but DB stores extra params in a JSON column.
            const existingGoals = (existingClient.goals || []).map(g => {
                let parsed = { ...g };
                let fromParams = {};

                if (typeof g.params === 'string') {
                    try {
                        fromParams = JSON.parse(g.params);
                    } catch (e) { /* ignore */ }
                } else if (typeof g.params === 'object' && g.params !== null) {
                    fromParams = g.params;
                }

                // Merge: DB columns (g) MUST take precedence over stale params (fromParams)
                parsed = { ...fromParams, ...g };

                // Ensure number types for calculation from both sources
                const numericFields = ['target_amount', 'initial_capital', 'term_months', 'monthly_replenishment', 'priority', 'goal_type_id'];
                numericFields.forEach(field => {
                    if (parsed[field] !== undefined && parsed[field] !== null) {
                        parsed[field] = Number(parsed[field]);
                    }
                });

                return parsed;
            });

            if (!req.body.goals || req.body.goals.length === 0) {
                // If no goals sent, imply "recalculate current state"
                goalsToCalculate = existingGoals;
            } else {
                // Strategy: Start with existing goals, Apply updates from request
                // We map by ID for fast lookup.
                // If incoming goal has no ID, we check for "Singleton" types (Pension, Reserve) to avoid duplication.

                const goalsMap = new Map();
                existingGoals.forEach(g => {
                    if (g.id) goalsMap.set(String(g.id), g);
                });

                req.body.goals.forEach(newGoal => {
                    // Ensure types for new goal
                    const numericFields = ['target_amount', 'initial_capital', 'term_months', 'monthly_replenishment', 'priority', 'goal_type_id', 'desired_monthly_income'];
                    numericFields.forEach(field => {
                        if (newGoal[field] !== undefined && newGoal[field] !== null) {
                            newGoal[field] = Number(newGoal[field]);
                        }
                    });

                    let matchFound = false;

                    // 1. Try Match by ID
                    if (newGoal.id && goalsMap.has(String(newGoal.id))) {
                        const existing = goalsMap.get(String(newGoal.id));
                        goalsMap.set(String(newGoal.id), { ...existing, ...newGoal });
                        matchFound = true;
                    }

                    // 1.1 Match by Name and Type (Safety for when ID is missing from frontend)
                    if (!matchFound && newGoal.name && newGoal.goal_type_id) {
                        for (const [key, val] of goalsMap.entries()) {
                            if (val.name === newGoal.name && val.goal_type_id === newGoal.goal_type_id) {
                                goalsMap.set(key, { ...val, ...newGoal });
                                matchFound = true;
                                break;
                            }
                        }
                    }

                    // 2. Try Match by Type for Unique Goals (if no ID or ID not found/mismatched)
                    // Unique Types: 1 (Pension), 7 (FinReserve)
                    if (!matchFound && [1, 7].includes(newGoal.goal_type_id)) {
                        for (const [key, val] of goalsMap.entries()) {
                            if (val.goal_type_id === newGoal.goal_type_id) {
                                goalsMap.set(key, { ...val, ...newGoal });
                                matchFound = true;
                                break;
                            }
                        }
                    }

                    // 3. If still no match, it's a new goal (simulation)
                    if (!matchFound) {
                        // Use provided ID or generate temp
                        const key = newGoal.id ? String(newGoal.id) : `temp_${Date.now()}_${Math.random()}`;
                        goalsMap.set(key, newGoal);
                    }
                });

                goalsToCalculate = Array.from(goalsMap.values());
            }

            // Client/Assets: Merge
            // We construct the 'client' object expected by calculateFirstRun
            const clientForCalc = {
                ...existingClient, // base properties
                ...req.body.client, // overrides (e.g. new avg_monthly_income)
                assets: req.body.client?.assets || existingClient.assets || [], // explicit assets override or existing
                birth_date: existingClient.birth_date, // ensure critical fields preserved if not overridden
                sex: existingClient.gender || existingClient.sex,
                total_liquid_capital: req.body.client?.total_liquid_capital !== undefined
                    ? req.body.client.total_liquid_capital
                    : (existingClient.total_liquid_capital !== undefined ? Number(existingClient.total_liquid_capital) : (existingClient.assets_total || 0))
            };

            // 3. Prepare Calculation Request
            const calcRequest = {
                client: clientForCalc,
                goals: goalsToCalculate
            };

            // 4. Run Calculation
            // Detect if we can do partial recalculation (only if exactly one goal was updated)
            let targetGoalId = null;
            let previousCalculation = null;

            if (req.body.goals && req.body.goals.length === 1 && req.body.goals[0].id) {
                targetGoalId = req.body.goals[0].id;
                try {
                    previousCalculation = typeof existingClient.goals_summary === 'string'
                        ? JSON.parse(existingClient.goals_summary)
                        : existingClient.goals_summary;
                    console.log(`[ClientController] Triggering partial recalculation for goal: ${targetGoalId}`);
                } catch (e) {
                    console.warn('[ClientController] Failed to parse previous goals_summary for partial recalculation');
                }
            }

            // This will re-run Smart Allocation (full or partial) with the (potentially new) pool and goals
            const calculation = await calculationService.calculateFirstRun(calcRequest, targetGoalId, previousCalculation);

            // 5. Update Client Record with New Summary
            // We save the result 'goals_summary' so the dashboard updates permanently.
            await clientService.updateClient(id, {
                goals_summary: JSON.stringify(calculation)
            });

            // Return the full calculation result (which already contains client_id and calculation keys)
            res.json(calculation);

        } catch (err) {
            next(err);
        }
    }

    async addGoal(req, res, next) {
        try {
            const { id } = req.params;
            const agentId = req.user.agentId;

            // 1. Add Goal to DB
            await clientService.addGoal(id, req.body);

            // 2. Trigger Recalculate
            // This now automatically updates goals_summary and returns flat response
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
            const agentId = req.user.agentId;

            // 1. Delete Goal from DB
            await clientService.deleteGoal(id, goalId);

            // 2. Trigger Recalculate
            if (!req.body) req.body = {};
            req.body.goals = null;
            return this.recalculate(req, res, next);
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new ClientController();
