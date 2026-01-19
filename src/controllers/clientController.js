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
            const { page, limit, sort, order, search } = req.query;

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

            // Goals: If provided, replace/update. If not, use existing.
            // Note: clientService.getFullClient returns goals in 'goals' property.
            let goalsToCalculate = req.body.goals || existingClient.goals;

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
                    : (existingClient.assets_total || 0) // fallback if not sent, though calculationService usually sums assets
            };

            // 3. Prepare Calculation Request
            const calcRequest = {
                client: clientForCalc,
                goals: goalsToCalculate
            };

            // 4. Run Calculation
            // This will re-run Smart Allocation with the (potentially new) pool and goals
            const calculation = await calculationService.calculateFirstRun(calcRequest);

            // 5. Update Client Record with New Summary
            // We intentionally do NOT save the full merge back to DB yet, unless we want "Auto-Save".
            // Usually "Recalculate" is a preview. But the prompt says "Change parameters... we recalculate".
            // Let's SAVE the result 'goals_summary' so the chart on frontend updates permanently if this was an edit.
            // BUT: Do we save the changes to Goals/Assets tables? 
            // The User said: "Method Change Goal... method that allows 'falling into' a financial plan".
            // Typically "Recalculate" = Preview, "Save" = Commit. 
            // However, to keep it simple and consistent with "First Run", let's update the JSON snapshot. 
            // If the user wants to *persist* the changed Goal parameters (e.g. new target amount), we should probably update the DB entities too.
            // For now, let's assume this endpoint is "Update & Recalculate".

            // If request contained real updates, save them.
            if (req.body.goals || req.body.client) {
                // Construct full update payload for updateFullClient
                const updatePayload = {
                    client: { ...clientForCalc }, // normalized
                    goals: goalsToCalculate,
                    assets: clientForCalc.assets
                };
                // Remove calculated fields or fields not for update
                delete updatePayload.client.goals_summary;
                // We might need to map 'gender' back to 'sex' or similar if updateFullClient is picky, 
                // but it seems robust.

                // However, doing a full DB update is heavy. 
                // For now, let's just update the goals_summary snapshot so the dashboard reflects the new numbers.
                await clientService.updateClient(id, {
                    goals_summary: JSON.stringify(calculation)
                });

                // If we strictly follow REST, PUT /api/client/:id updates DB, then we might call recalculate internally.
                // But here we want a specific action.
                // Let's proceed with just updating the snapshot for visualization.
            }

            res.json({
                client_id: id,
                calculation: calculation
            });

        } catch (err) {
            next(err);
        }
    }
}

module.exports = new ClientController();
