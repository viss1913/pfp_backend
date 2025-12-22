const calculationService = require('../services/calculationService');
const Joi = require('joi');

// Схема валидации для запроса расчета
const calculationRequestSchema = Joi.object({
    goals: Joi.array().items(Joi.object({
        goal_type_id: Joi.number().integer().positive().required()
            .description('ID класса портфеля (из portfolio_classes). Для LIFE используйте 5'),
        name: Joi.string().required()
            .description('Название цели'),
        target_amount: Joi.number().positive().required()
            .description('Целевая сумма'),
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

            // 2. Save/Update Profile
            const clientId = await clientService.createFullClient(req.body);

            // 3. Perform Calculation
            const calculation = await calculationService.calculateFirstRun(req.body);

            // 4. Return combined result
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
            const clientId = await clientService.createFullClient(req.body);
            const fullClient = await clientService.getFullClient(clientId);
            res.status(201).json(fullClient);
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
            // TODO: Implement update logic in service
            res.status(501).json({ message: 'Not implemented yet' });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new ClientController();
