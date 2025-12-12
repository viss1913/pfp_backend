const calculationService = require('../services/calculationService');
const settingsService = require('../services/settingsService');
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
        term_months: Joi.number().integer().positive().required()
            .description('Срок достижения цели в месяцах'),
        risk_profile: Joi.string().valid('CONSERVATIVE', 'BALANCED', 'AGGRESSIVE').required()
            .description('Риск-профиль: CONSERVATIVE, BALANCED или AGGRESSIVE'),
        initial_capital: Joi.number().min(0).optional().default(0)
            .description('Начальный капитал (опционально, по умолчанию 0)'),
        inflation_rate: Joi.number().min(0).optional()
            .description('Годовая ставка инфляции в % (опционально, берется из настроек если не указано)'),
        // Параметры для НСЖ (LIFE)
        payment_variant: Joi.number().integer().valid(0, 1, 2, 4, 12).optional()
            .description('Вариант оплаты для НСЖ: 0 - единовременно, 1 - ежегодно, 2 - раз в полгода, 4 - ежеквартально, 12 - ежемесячно'),
        program: Joi.string().optional()
            .description('Код продукта НСЖ (по умолчанию "base")')
    })).min(1).required()
        .description('Массив целей для расчета'),
    client: Joi.object({
        birth_date: Joi.string().optional()
            .description('Дата рождения клиента (формат: YYYY-MM-DD или ISO 8601). Требуется для расчета НСЖ'),
        sex: Joi.string().valid('male', 'female', 'M', 'F', 'мужской', 'женский').optional()
            .description('Пол клиента. Требуется для расчета НСЖ'),
        fio: Joi.string().optional()
            .description('ФИО клиента'),
        name: Joi.string().optional()
            .description('Имя клиента (альтернатива fio)'),
        phone: Joi.string().optional()
            .description('Телефон клиента'),
        email: Joi.string().email().optional()
            .description('Email клиента'),
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
        .description('Данные клиента (опционально, но рекомендуется для расчета НСЖ)')
});

class ClientController {
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

    /**
     * POST /client/pds/calc-cofin
     * Рассчитать размер софинансирования ПДС
     */
    async calculatePdsCofinancing(req, res, next) {
        try {
            // Схема валидации для запроса расчета софинансирования
            const calcCofinSchema = Joi.object({
                yearly_contribution: Joi.number().integer().min(0).required()
                    .description('Годовой взнос (₽)'),
                avg_monthly_income: Joi.number().integer().min(0).required()
                    .description('Среднемесячный доход ДО НДФЛ (₽/мес)')
            });

            const validation = calcCofinSchema.validate(req.body, { abortEarly: false });
            if (validation.error) {
                return res.status(400).json({
                    error: 'Validation error',
                    details: validation.error.details.map(d => ({
                        field: d.path.join('.'),
                        message: d.message
                    }))
                });
            }

            const { yearly_contribution, avg_monthly_income } = req.body;
            const result = await settingsService.calculatePdsCofinancing(
                yearly_contribution,
                avg_monthly_income
            );
            res.json(result);
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new ClientController();
