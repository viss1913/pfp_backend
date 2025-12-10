const calculationService = require('../services/calculationService');
const Joi = require('joi');

// Схема валидации для запроса расчета
const calculationRequestSchema = Joi.object({
    goals: Joi.array().items(Joi.object({
        goal_type_id: Joi.number().integer().positive().required()
            .description('ID класса портфеля (из portfolio_classes)'),
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
            .description('Годовая ставка инфляции в % (опционально, берется из настроек если не указано)')
    })).min(1).required()
        .description('Массив целей для расчета')
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
}

module.exports = new ClientController();
