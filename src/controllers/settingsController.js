const settingsService = require('../services/settingsService');
const Joi = require('joi');

const settingSchema = Joi.object({
    key: Joi.string().required(),
    value: Joi.alternatives().try(Joi.string(), Joi.number(), Joi.object()).required(),
    description: Joi.string().allow(null, ''),
    category: Joi.string().allow(null, '')
});

const updateSettingSchema = Joi.object({
    value: Joi.alternatives().try(Joi.string(), Joi.number(), Joi.object()).required()
});

// Схемы валидации для налоговых ставок 2НДФЛ
const taxBracketSchema = Joi.object({
    income_from: Joi.number().min(0).required(),
    income_to: Joi.number().min(0).required(),
    rate: Joi.number().min(0).max(100).required(),
    order_index: Joi.number().integer().min(0).optional()
});

const taxBracketUpdateSchema = Joi.object({
    income_from: Joi.number().min(0).optional(),
    income_to: Joi.number().min(0).optional(),
    rate: Joi.number().min(0).max(100).optional(),
    order_index: Joi.number().integer().min(0).optional()
});

const taxBracketsBulkSchema = Joi.object({
    brackets: Joi.array().items(taxBracketSchema).min(1).required()
});

// Схемы валидации для настроек ПДС софинансирования
const pdsCofinSettingsUpdateSchema = Joi.object({
    max_state_cofin_amount_per_year: Joi.number().integer().min(0).optional(),
    min_contribution_for_support_per_year: Joi.number().integer().min(0).optional(),
    income_basis: Joi.string().valid('gross_before_ndfl', 'net_after_ndfl').optional()
});

// Схемы валидации для шкалы доходов ПДС
const pdsCofinIncomeBracketSchema = Joi.object({
    income_from: Joi.number().integer().min(0).required(),
    income_to: Joi.number().integer().min(0).allow(null).optional(),
    ratio_numerator: Joi.number().integer().positive().required(),
    ratio_denominator: Joi.number().integer().positive().required()
});

const pdsCofinIncomeBracketUpdateSchema = Joi.object({
    income_from: Joi.number().integer().min(0).optional(),
    income_to: Joi.number().integer().min(0).allow(null).optional(),
    ratio_numerator: Joi.number().integer().positive().optional(),
    ratio_denominator: Joi.number().integer().positive().optional()
});

// Схемы валидации для линий доходности пассивного дохода
const passiveIncomeYieldLineSchema = Joi.object({
    min_term_months: Joi.number().min(0).required(),
    max_term_months: Joi.number().min(0).required(),
    min_amount: Joi.number().min(0).required(),
    max_amount: Joi.number().min(0).required(),
    yield_percent: Joi.number().min(0).required()
});

const passiveIncomeYieldUpdateSchema = Joi.object({
    lines: Joi.array().items(passiveIncomeYieldLineSchema).min(1).required()
});

class SettingsController {
    async getAll(req, res, next) {
        try {
            const { category } = req.query;
            const settings = await settingsService.getAllSettings(category);
            res.json(settings);
        } catch (err) {
            next(err);
        }
    }

    async getByKey(req, res, next) {
        try {
            const { key } = req.params;
            const setting = await settingsService.getSettingByKey(key);
            res.json(setting);
        } catch (err) {
            next(err);
        }
    }

    async update(req, res, next) {
        try {
            const { key } = req.params;
            const isAdmin = req.user.isAdmin;

            const validation = updateSettingSchema.validate(req.body);
            if (validation.error) {
                return res.status(400).json({ error: validation.error.details[0].message });
            }

            const updated = await settingsService.updateSetting(key, req.body.value, isAdmin);
            res.json(updated);
        } catch (err) {
            next(err);
        }
    }

    async create(req, res, next) {
        try {
            const isAdmin = req.user.isAdmin;

            const validation = settingSchema.validate(req.body);
            if (validation.error) {
                return res.status(400).json({ error: validation.error.details[0].message });
            }

            const created = await settingsService.createSetting(req.body, isAdmin);
            res.status(201).json(created);
        } catch (err) {
            next(err);
        }
    }

    async delete(req, res, next) {
        try {
            const { key } = req.params;
            const isAdmin = req.user.isAdmin;

            await settingsService.deleteSetting(key, isAdmin);
            res.status(204).send();
        } catch (err) {
            next(err);
        }
    }

    // ========== Методы для работы с налоговыми ставками 2НДФЛ ==========

    /**
     * GET /settings/tax-2ndfl/brackets
     * Получить все налоговые ставки
     */
    async getAllTaxBrackets(req, res, next) {
        try {
            const brackets = await settingsService.getAllTaxBrackets();
            res.json(brackets);
        } catch (err) {
            next(err);
        }
    }

    /**
     * GET /settings/tax-2ndfl/brackets/:id
     * Получить налоговую ставку по ID
     */
    async getTaxBracketById(req, res, next) {
        try {
            const { id } = req.params;
            const bracket = await settingsService.getTaxBracketById(parseInt(id));
            res.json(bracket);
        } catch (err) {
            next(err);
        }
    }

    /**
     * GET /settings/tax-2ndfl/brackets/by-income/:income
     * Найти налоговую ставку для конкретного дохода
     */
    async getTaxBracketByIncome(req, res, next) {
        try {
            const { income } = req.params;
            const bracket = await settingsService.getTaxBracketByIncome(parseFloat(income));
            res.json(bracket);
        } catch (err) {
            next(err);
        }
    }

    /**
     * POST /settings/tax-2ndfl/brackets
     * Создать новую налоговую ставку
     */
    async createTaxBracket(req, res, next) {
        try {
            const isAdmin = req.user.isAdmin;

            const validation = taxBracketSchema.validate(req.body);
            if (validation.error) {
                return res.status(400).json({ error: validation.error.details[0].message });
            }

            const created = await settingsService.createTaxBracket(req.body, isAdmin);
            res.status(201).json(created);
        } catch (err) {
            next(err);
        }
    }

    /**
     * PUT /settings/tax-2ndfl/brackets/:id
     * Обновить налоговую ставку
     */
    async updateTaxBracket(req, res, next) {
        try {
            const { id } = req.params;
            const isAdmin = req.user.isAdmin;

            const validation = taxBracketUpdateSchema.validate(req.body);
            if (validation.error) {
                return res.status(400).json({ error: validation.error.details[0].message });
            }

            const updated = await settingsService.updateTaxBracket(parseInt(id), req.body, isAdmin);
            res.json(updated);
        } catch (err) {
            next(err);
        }
    }

    /**
     * DELETE /settings/tax-2ndfl/brackets/:id
     * Удалить налоговую ставку
     */
    async deleteTaxBracket(req, res, next) {
        try {
            const { id } = req.params;
            const isAdmin = req.user.isAdmin;

            await settingsService.deleteTaxBracket(parseInt(id), isAdmin);
            res.status(204).send();
        } catch (err) {
            next(err);
        }
    }

    /**
     * POST /settings/tax-2ndfl/brackets/bulk
     * Создать несколько налоговых ставок за раз
     */
    async createTaxBracketsBulk(req, res, next) {
        try {
            const isAdmin = req.user.isAdmin;

            const validation = taxBracketsBulkSchema.validate(req.body);
            if (validation.error) {
                return res.status(400).json({ error: validation.error.details[0].message });
            }

            const brackets = await settingsService.createTaxBracketsMany(req.body.brackets, isAdmin);
            res.status(201).json(brackets);
        } catch (err) {
            next(err);
        }
    }

    // ========== Методы для работы с настройками ПДС софинансирования ==========

    /**
     * GET /settings/pds/cofin-settings
     * Получить настройки софинансирования ПДС
     */
    async getPdsCofinSettings(req, res, next) {
        try {
            const settings = await settingsService.getPdsCofinSettings();
            res.json(settings);
        } catch (err) {
            next(err);
        }
    }

    /**
     * PATCH /settings/pds/cofin-settings
     * Обновить настройки софинансирования ПДС
     */
    async updatePdsCofinSettings(req, res, next) {
        try {
            const isAdmin = req.user.isAdmin;

            const validation = pdsCofinSettingsUpdateSchema.validate(req.body);
            if (validation.error) {
                return res.status(400).json({ error: validation.error.details[0].message });
            }

            const updated = await settingsService.updatePdsCofinSettings(req.body, isAdmin);
            res.json(updated);
        } catch (err) {
            next(err);
        }
    }

    // ========== Методы для работы с шкалой доходов ПДС ==========

    /**
     * GET /settings/pds/cofin-income-brackets
     * Получить все диапазоны доходов для софинансирования ПДС
     */
    async getAllPdsCofinIncomeBrackets(req, res, next) {
        try {
            const brackets = await settingsService.getAllPdsCofinIncomeBrackets();
            res.json(brackets);
        } catch (err) {
            next(err);
        }
    }

    /**
     * GET /settings/pds/cofin-income-brackets/:id
     * Получить диапазон по ID
     */
    async getPdsCofinIncomeBracketById(req, res, next) {
        try {
            const { id } = req.params;
            const bracket = await settingsService.getPdsCofinIncomeBracketById(parseInt(id));
            res.json(bracket);
        } catch (err) {
            next(err);
        }
    }

    /**
     * POST /settings/pds/cofin-income-brackets
     * Создать новый диапазон доходов
     */
    async createPdsCofinIncomeBracket(req, res, next) {
        try {
            const isAdmin = req.user.isAdmin;

            const validation = pdsCofinIncomeBracketSchema.validate(req.body);
            if (validation.error) {
                return res.status(400).json({ error: validation.error.details[0].message });
            }

            const created = await settingsService.createPdsCofinIncomeBracket(req.body, isAdmin);
            res.status(201).json(created);
        } catch (err) {
            next(err);
        }
    }

    /**
     * PATCH /settings/pds/cofin-income-brackets/:id
     * Обновить диапазон доходов
     */
    async updatePdsCofinIncomeBracket(req, res, next) {
        try {
            const { id } = req.params;
            const isAdmin = req.user.isAdmin;

            const validation = pdsCofinIncomeBracketUpdateSchema.validate(req.body);
            if (validation.error) {
                return res.status(400).json({ error: validation.error.details[0].message });
            }

            const updated = await settingsService.updatePdsCofinIncomeBracket(parseInt(id), req.body, isAdmin);
            res.json(updated);
        } catch (err) {
            next(err);
        }
    }

    /**
     * DELETE /settings/pds/cofin-income-brackets/:id
     * Удалить диапазон доходов
     */
    async deletePdsCofinIncomeBracket(req, res, next) {
        try {
            const { id } = req.params;
            const isAdmin = req.user.isAdmin;

            await settingsService.deletePdsCofinIncomeBracket(parseInt(id), isAdmin);
            res.status(204).send();
        } catch (err) {
            next(err);
        }
    }

    // ========== Методы для работы с линиями доходности пассивного дохода ==========

    /**
     * GET /settings/passive-income/yield
     * Получить все линии доходности для пассивного дохода
     */
    async getPassiveIncomeYield(req, res, next) {
        try {
            const yieldSettings = await settingsService.getPassiveIncomeYield();
            res.json(yieldSettings);
        } catch (err) {
            next(err);
        }
    }

    /**
     * PUT /settings/passive-income/yield
     * Обновить линии доходности для пассивного дохода (admin only)
     */
    async updatePassiveIncomeYield(req, res, next) {
        try {
            const isAdmin = req.user.isAdmin;

            console.log('=== Passive Income Yield Update Request ===');
            console.log('Request body:', JSON.stringify(req.body, null, 2));

            // Предварительная обработка: конвертируем строки в числа
            if (req.body && req.body.lines && Array.isArray(req.body.lines)) {
                req.body.lines = req.body.lines.map((line, index) => {
                    const converted = {
                        min_term_months: typeof line.min_term_months === 'string' ? parseFloat(line.min_term_months) : (typeof line.min_term_months === 'number' ? line.min_term_months : NaN),
                        max_term_months: typeof line.max_term_months === 'string' ? parseFloat(line.max_term_months) : (typeof line.max_term_months === 'number' ? line.max_term_months : NaN),
                        min_amount: typeof line.min_amount === 'string' ? parseFloat(line.min_amount) : (typeof line.min_amount === 'number' ? line.min_amount : NaN),
                        max_amount: typeof line.max_amount === 'string' ? parseFloat(line.max_amount) : (typeof line.max_amount === 'number' ? line.max_amount : NaN),
                        yield_percent: typeof line.yield_percent === 'string' ? parseFloat(line.yield_percent) : (typeof line.yield_percent === 'number' ? line.yield_percent : NaN)
                    };
                    console.log(`Line ${index} converted:`, converted);
                    return converted;
                });
            }

            console.log('Processed lines:', JSON.stringify(req.body.lines, null, 2));

            const validation = passiveIncomeYieldUpdateSchema.validate(req.body, { 
                abortEarly: false,
                convert: true 
            });
            if (validation.error) {
                console.error('Validation error:', validation.error);
                const errorMessages = validation.error.details.map(detail => detail.message).join('; ');
                return res.status(400).json({ 
                    error: 'Validation error',
                    message: errorMessages,
                    details: validation.error.details
                });
            }

            const updated = await settingsService.updatePassiveIncomeYield(req.body.lines, isAdmin);
            res.json(updated);
        } catch (err) {
            console.error('Error in updatePassiveIncomeYield:', err);
            next(err);
        }
    }
}

module.exports = new SettingsController();
