const settingsRepository = require('../repositories/settingsRepository');
const tax2ndflRepository = require('../repositories/tax2ndflRepository');
const pdsSettingsRepository = require('../repositories/pdsSettingsRepository');
const pdsCofinIncomeBracketsRepository = require('../repositories/pdsCofinIncomeBracketsRepository');

class SettingsService {
    async getAllSettings(category = null) {
        const settings = await settingsRepository.findAll(category);

        // Парсим значения для удобства
        return settings.map(s => ({
            key: s.key,
            value: this._parseValue(s.value, s.value_type),
            description: s.description,
            category: s.category,
            updated_at: s.updated_at
        }));
    }

    async getSettingByKey(key) {
        const setting = await settingsRepository.findByKey(key);
        if (!setting) throw { status: 404, message: 'Setting not found' };

        return {
            key: setting.key,
            value: this._parseValue(setting.value, setting.value_type),
            description: setting.description,
            category: setting.category,
            updated_at: setting.updated_at
        };
    }

    async updateSetting(key, value, isAdmin) {
        // Только админ может менять настройки
        if (!isAdmin) {
            throw { status: 403, message: 'Only admin can update settings' };
        }

        const setting = await settingsRepository.findByKey(key);
        if (!setting) throw { status: 404, message: 'Setting not found' };

        await settingsRepository.updateByKey(key, value);
        return this.getSettingByKey(key);
    }

    async createSetting(data, isAdmin) {
        if (!isAdmin) {
            throw { status: 403, message: 'Only admin can create settings' };
        }

        const existing = await settingsRepository.findByKey(data.key);
        if (existing) {
            throw { status: 400, message: 'Setting with this key already exists' };
        }

        const id = await settingsRepository.create(data);
        return this.getSettingByKey(data.key);
    }

    async deleteSetting(key, isAdmin) {
        if (!isAdmin) {
            throw { status: 403, message: 'Only admin can delete settings' };
        }

        const setting = await settingsRepository.findByKey(key);
        if (!setting) throw { status: 404, message: 'Setting not found' };

        await settingsRepository.delete(key);
        return { success: true };
    }

    // Вспомогательный метод для парсинга значений
    _parseValue(value, type) {
        switch (type) {
            case 'number':
                return parseFloat(value);
            case 'json':
                return JSON.parse(value);
            default:
                return value;
        }
    }

    // Метод для получения конкретного значения (для использования в расчётах)
    async getValue(key) {
        return settingsRepository.getValue(key);
    }

    // Алиас для getValue (для удобства использования в расчетах)
    async get(key) {
        const setting = await settingsRepository.findByKey(key);
        if (!setting) return null;
        
        return {
            key: setting.key,
            value: this._parseValue(setting.value, setting.value_type),
            description: setting.description,
            category: setting.category,
            updated_at: setting.updated_at
        };
    }

    // ========== Методы для работы с налоговыми ставками 2НДФЛ ==========

    /**
     * Получить все налоговые ставки 2НДФЛ
     */
    async getAllTaxBrackets() {
        return tax2ndflRepository.findAll();
    }

    /**
     * Получить налоговую ставку по ID
     */
    async getTaxBracketById(id) {
        const bracket = await tax2ndflRepository.findById(id);
        if (!bracket) {
            throw { 
                status: 404, 
                message: `Tax bracket with id ${id} not found`,
                error: 'Tax bracket not found'
            };
        }
        return bracket;
    }

    /**
     * Найти налоговую ставку для конкретного дохода
     */
    async getTaxBracketByIncome(income) {
        const bracket = await tax2ndflRepository.findByIncome(income);
        if (!bracket) {
            throw { 
                status: 404, 
                message: `No tax bracket found for income ${income}`,
                error: 'Tax bracket not found'
            };
        }
        return bracket;
    }

    /**
     * Создать новую налоговую ставку
     */
    async createTaxBracket(data, isAdmin) {
        if (!isAdmin) {
            throw { 
                status: 403, 
                message: 'Only administrators can manage tax brackets',
                error: 'Forbidden'
            };
        }

        // Валидация: проверяем, что income_to > income_from
        if (data.income_to <= data.income_from) {
            throw {
                status: 400,
                message: 'income_to must be greater than income_from',
                error: 'Validation error'
            };
        }

        // Валидация: проверяем, что диапазоны не пересекаются
        const existing = await tax2ndflRepository.findAll();
        for (const bracket of existing) {
            // Проверка пересечения: (a_from <= b_to) AND (a_to >= b_from)
            if (
                (data.income_from <= bracket.income_to) && 
                (data.income_to >= bracket.income_from)
            ) {
                throw { 
                    status: 400, 
                    message: `Income range [${data.income_from}, ${data.income_to}] overlaps with existing bracket [${bracket.income_from}, ${bracket.income_to}] (id: ${bracket.id})`,
                    error: 'Overlapping brackets'
                };
            }
        }

        // Автоматическое назначение order_index, если не указан
        if (data.order_index === undefined || data.order_index === null) {
            if (existing.length > 0) {
                const maxOrderIndex = Math.max(...existing.map(b => b.order_index || 0));
                data.order_index = maxOrderIndex + 1;
            } else {
                data.order_index = 0;
            }
        }

        const id = await tax2ndflRepository.create(data);
        return tax2ndflRepository.findById(id);
    }

    /**
     * Обновить налоговую ставку
     */
    async updateTaxBracket(id, data, isAdmin) {
        if (!isAdmin) {
            throw { 
                status: 403, 
                message: 'Only administrators can manage tax brackets',
                error: 'Forbidden'
            };
        }

        const existing = await tax2ndflRepository.findById(id);
        if (!existing) {
            throw { 
                status: 404, 
                message: `Tax bracket with id ${id} not found`,
                error: 'Tax bracket not found'
            };
        }

        // Валидация: если указаны оба поля, проверяем, что income_to > income_from
        if (data.income_from !== undefined && data.income_to !== undefined) {
            if (data.income_to <= data.income_from) {
                throw {
                    status: 400,
                    message: 'income_to must be greater than income_from',
                    error: 'Validation error'
                };
            }
        }

        // Валидация пересечений (исключая текущую запись)
        const allBrackets = await tax2ndflRepository.findAll();
        const incomeFrom = data.income_from !== undefined ? data.income_from : existing.income_from;
        const incomeTo = data.income_to !== undefined ? data.income_to : existing.income_to;

        for (const bracket of allBrackets) {
            if (bracket.id === id) continue; // Пропускаем текущую запись

            // Проверка пересечения: (a_from <= b_to) AND (a_to >= b_from)
            if (
                (incomeFrom <= bracket.income_to) && 
                (incomeTo >= bracket.income_from)
            ) {
                throw { 
                    status: 400, 
                    message: `Income range [${incomeFrom}, ${incomeTo}] overlaps with existing bracket [${bracket.income_from}, ${bracket.income_to}] (id: ${bracket.id})`,
                    error: 'Overlapping brackets'
                };
            }
        }

        await tax2ndflRepository.update(id, data);
        return tax2ndflRepository.findById(id);
    }

    /**
     * Удалить налоговую ставку
     */
    async deleteTaxBracket(id, isAdmin) {
        if (!isAdmin) {
            throw { 
                status: 403, 
                message: 'Only administrators can manage tax brackets',
                error: 'Forbidden'
            };
        }

        const bracket = await tax2ndflRepository.findById(id);
        if (!bracket) {
            throw { 
                status: 404, 
                message: `Tax bracket with id ${id} not found`,
                error: 'Tax bracket not found'
            };
        }

        await tax2ndflRepository.delete(id);
        return { success: true };
    }

    /**
     * Создать несколько налоговых ставок за раз (bulk create)
     */
    async createTaxBracketsMany(brackets, isAdmin) {
        if (!isAdmin) {
            throw { 
                status: 403, 
                message: 'Only administrators can manage tax brackets',
                error: 'Forbidden'
            };
        }

        // Валидация: проверяем, что для каждой ставки income_to > income_from
        for (let i = 0; i < brackets.length; i++) {
            const bracket = brackets[i];
            if (bracket.income_to <= bracket.income_from) {
                throw {
                    status: 400,
                    message: `Bracket at index ${i}: income_to must be greater than income_from`,
                    error: 'Validation error'
                };
            }
        }

        // Валидация всех диапазонов на пересечения
        const existing = await tax2ndflRepository.findAll();
        const allBrackets = [...existing, ...brackets];

        // Проверка пересечений между новыми ставками
        for (let i = 0; i < brackets.length; i++) {
            for (let j = i + 1; j < brackets.length; j++) {
                const b1 = brackets[i];
                const b2 = brackets[j];
                
                // Проверка пересечения: (a_from <= b_to) AND (a_to >= b_from)
                if (
                    (b1.income_from <= b2.income_to) && 
                    (b1.income_to >= b2.income_from)
                ) {
                    throw { 
                        status: 400, 
                        message: `Bracket at index ${i} overlaps with bracket at index ${j}`,
                        error: 'Validation error'
                    };
                }
            }
        }

        // Проверка пересечений новых ставок с существующими
        for (let i = 0; i < brackets.length; i++) {
            const newBracket = brackets[i];
            for (const existingBracket of existing) {
                // Проверка пересечения: (a_from <= b_to) AND (a_to >= b_from)
                if (
                    (newBracket.income_from <= existingBracket.income_to) && 
                    (newBracket.income_to >= existingBracket.income_from)
                ) {
                    throw { 
                        status: 400, 
                        message: `Bracket at index ${i} overlaps with existing bracket [${existingBracket.income_from}, ${existingBracket.income_to}] (id: ${existingBracket.id})`,
                        error: 'Overlapping brackets'
                    };
                }
            }
        }

        // Автоматическое назначение order_index для ставок, где он не указан
        let maxOrderIndex = 0;
        if (existing.length > 0) {
            maxOrderIndex = Math.max(...existing.map(b => b.order_index || 0));
        }

        const processedBrackets = brackets.map((bracket, index) => {
            if (bracket.order_index === undefined || bracket.order_index === null) {
                return {
                    ...bracket,
                    order_index: maxOrderIndex + index + 1
                };
            }
            return bracket;
        });

        // Выполняем bulk insert в транзакции для атомарности
        const db = require('../config/database');
        await db.transaction(async (trx) => {
            const data = processedBrackets.map(bracket => ({
                income_from: parseFloat(bracket.income_from),
                income_to: parseFloat(bracket.income_to),
                rate: parseFloat(bracket.rate),
                order_index: bracket.order_index !== undefined && bracket.order_index !== null ? parseInt(bracket.order_index) : 0
            }));
            await trx('tax_2ndfl_brackets').insert(data);
        });

        return tax2ndflRepository.findAll();
    }

    // ========== Методы для работы с настройками ПДС софинансирования ==========

    /**
     * Получить настройки софинансирования ПДС
     */
    async getPdsCofinSettings() {
        const settings = await pdsSettingsRepository.find();
        if (!settings) {
            throw { 
                status: 404, 
                message: 'PDS cofinancing settings not found',
                error: 'Settings not found'
            };
        }
        return settings;
    }

    /**
     * Обновить настройки софинансирования ПДС
     */
    async updatePdsCofinSettings(data, isAdmin) {
        if (!isAdmin) {
            throw { 
                status: 403, 
                message: 'Only administrators can manage PDS cofinancing settings',
                error: 'Forbidden'
            };
        }

        // Валидация значений
        if (data.max_state_cofin_amount_per_year !== undefined && data.max_state_cofin_amount_per_year < 0) {
            throw {
                status: 400,
                message: 'max_state_cofin_amount_per_year must be non-negative',
                error: 'Validation error'
            };
        }
        if (data.min_contribution_for_support_per_year !== undefined && data.min_contribution_for_support_per_year < 0) {
            throw {
                status: 400,
                message: 'min_contribution_for_support_per_year must be non-negative',
                error: 'Validation error'
            };
        }
        if (data.income_basis !== undefined && !['gross_before_ndfl', 'net_after_ndfl'].includes(data.income_basis)) {
            throw {
                status: 400,
                message: 'income_basis must be either "gross_before_ndfl" or "net_after_ndfl"',
                error: 'Validation error'
            };
        }

        await pdsSettingsRepository.update(data);
        return pdsSettingsRepository.find();
    }

    // ========== Методы для работы с шкалой доходов ПДС ==========

    /**
     * Получить все диапазоны доходов для софинансирования ПДС
     */
    async getAllPdsCofinIncomeBrackets() {
        return pdsCofinIncomeBracketsRepository.findAll();
    }

    /**
     * Получить диапазон по ID
     */
    async getPdsCofinIncomeBracketById(id) {
        const bracket = await pdsCofinIncomeBracketsRepository.findById(id);
        if (!bracket) {
            throw { 
                status: 404, 
                message: `PDS cofinancing income bracket with id ${id} not found`,
                error: 'Bracket not found'
            };
        }
        return bracket;
    }

    /**
     * Создать новый диапазон доходов
     */
    async createPdsCofinIncomeBracket(data, isAdmin) {
        if (!isAdmin) {
            throw { 
                status: 403, 
                message: 'Only administrators can manage PDS cofinancing income brackets',
                error: 'Forbidden'
            };
        }

        // Валидация: проверяем, что income_from >= 0
        if (data.income_from < 0) {
            throw {
                status: 400,
                message: 'income_from must be non-negative',
                error: 'Validation error'
            };
        }

        // Валидация: если income_to указан, он должен быть > income_from
        if (data.income_to !== undefined && data.income_to !== null) {
            if (data.income_to <= data.income_from) {
                throw {
                    status: 400,
                    message: 'income_to must be greater than income_from (or null for unlimited)',
                    error: 'Validation error'
                };
            }
        }

        // Валидация: проверяем, что диапазоны не пересекаются
        const existing = await pdsCofinIncomeBracketsRepository.findAll();
        const incomeTo = data.income_to !== undefined && data.income_to !== null ? data.income_to : Infinity;
        
        for (const bracket of existing) {
            const bracketIncomeTo = bracket.income_to !== null ? bracket.income_to : Infinity;
            
            // Проверка пересечения: (a_from <= b_to) AND (a_to >= b_from)
            if (
                (data.income_from <= bracketIncomeTo) && 
                (incomeTo >= bracket.income_from)
            ) {
                throw { 
                    status: 400, 
                    message: `Income range [${data.income_from}, ${data.income_to === null ? '∞' : data.income_to}] overlaps with existing bracket [${bracket.income_from}, ${bracket.income_to === null ? '∞' : bracket.income_to}] (id: ${bracket.id})`,
                    error: 'Overlapping brackets'
                };
            }
        }

        // Валидация коэффициентов
        if (data.ratio_numerator <= 0 || data.ratio_denominator <= 0) {
            throw {
                status: 400,
                message: 'ratio_numerator and ratio_denominator must be positive',
                error: 'Validation error'
            };
        }

        const id = await pdsCofinIncomeBracketsRepository.create(data);
        return pdsCofinIncomeBracketsRepository.findById(id);
    }

    /**
     * Обновить диапазон доходов
     */
    async updatePdsCofinIncomeBracket(id, data, isAdmin) {
        if (!isAdmin) {
            throw { 
                status: 403, 
                message: 'Only administrators can manage PDS cofinancing income brackets',
                error: 'Forbidden'
            };
        }

        const existing = await pdsCofinIncomeBracketsRepository.findById(id);
        if (!existing) {
            throw { 
                status: 404, 
                message: `PDS cofinancing income bracket with id ${id} not found`,
                error: 'Bracket not found'
            };
        }

        // Валидация: если указаны оба поля, проверяем корректность диапазона
        const incomeFrom = data.income_from !== undefined ? data.income_from : existing.income_from;
        const incomeTo = data.income_to !== undefined ? (data.income_to === null ? null : data.income_to) : existing.income_to;
        
        if (incomeFrom < 0) {
            throw {
                status: 400,
                message: 'income_from must be non-negative',
                error: 'Validation error'
            };
        }

        if (incomeTo !== null && incomeTo !== undefined && incomeTo <= incomeFrom) {
            throw {
                status: 400,
                message: 'income_to must be greater than income_from (or null for unlimited)',
                error: 'Validation error'
            };
        }

        // Валидация пересечений (исключая текущую запись)
        const allBrackets = await pdsCofinIncomeBracketsRepository.findAll();
        const incomeToForCheck = incomeTo !== null && incomeTo !== undefined ? incomeTo : Infinity;

        for (const bracket of allBrackets) {
            if (bracket.id === id) continue; // Пропускаем текущую запись

            const bracketIncomeTo = bracket.income_to !== null ? bracket.income_to : Infinity;

            // Проверка пересечения: (a_from <= b_to) AND (a_to >= b_from)
            if (
                (incomeFrom <= bracketIncomeTo) && 
                (incomeToForCheck >= bracket.income_from)
            ) {
                throw { 
                    status: 400, 
                    message: `Income range [${incomeFrom}, ${incomeTo === null ? '∞' : incomeTo}] overlaps with existing bracket [${bracket.income_from}, ${bracket.income_to === null ? '∞' : bracket.income_to}] (id: ${bracket.id})`,
                    error: 'Overlapping brackets'
                };
            }
        }

        // Валидация коэффициентов
        const ratioNumerator = data.ratio_numerator !== undefined ? data.ratio_numerator : existing.ratio_numerator;
        const ratioDenominator = data.ratio_denominator !== undefined ? data.ratio_denominator : existing.ratio_denominator;
        
        if (ratioNumerator <= 0 || ratioDenominator <= 0) {
            throw {
                status: 400,
                message: 'ratio_numerator and ratio_denominator must be positive',
                error: 'Validation error'
            };
        }

        await pdsCofinIncomeBracketsRepository.update(id, data);
        return pdsCofinIncomeBracketsRepository.findById(id);
    }

    /**
     * Удалить диапазон доходов
     */
    async deletePdsCofinIncomeBracket(id, isAdmin) {
        if (!isAdmin) {
            throw { 
                status: 403, 
                message: 'Only administrators can manage PDS cofinancing income brackets',
                error: 'Forbidden'
            };
        }

        const bracket = await pdsCofinIncomeBracketsRepository.findById(id);
        if (!bracket) {
            throw { 
                status: 404, 
                message: `PDS cofinancing income bracket with id ${id} not found`,
                error: 'Bracket not found'
            };
        }

        await pdsCofinIncomeBracketsRepository.delete(id);
        return { success: true };
    }

    /**
     * Рассчитать размер софинансирования ПДС
     * @param {number} yearlyContribution - Годовой взнос (₽)
     * @param {number} avgMonthlyIncome - Среднемесячный доход ДО НДФЛ (₽/мес)
     * @returns {Promise<Object>} Результат расчета
     */
    // ========== Методы для работы с линиями доходности пассивного дохода ==========

    /**
     * Получить все линии доходности для пассивного дохода
     */
    async getPassiveIncomeYield() {
        const setting = await settingsRepository.findByKey('passive_income_yield');
        if (!setting) {
            throw { 
                status: 404, 
                message: 'Passive income yield settings not found',
                error: 'Settings not found'
            };
        }
        return {
            lines: this._parseValue(setting.value, setting.value_type),
            updated_at: setting.updated_at
        };
    }

    /**
     * Обновить линии доходности для пассивного дохода
     */
    async updatePassiveIncomeYield(lines, isAdmin) {
        if (!isAdmin) {
            throw { 
                status: 403, 
                message: 'Only administrators can manage passive income yield settings',
                error: 'Forbidden'
            };
        }

        // Валидация: проверяем, что lines - это массив
        if (!Array.isArray(lines)) {
            throw {
                status: 400,
                message: 'lines must be an array',
                error: 'Validation error'
            };
        }

        // Валидация каждой линии
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (typeof line.min_term_months !== 'number' || line.min_term_months < 0) {
                throw {
                    status: 400,
                    message: `Line ${i}: min_term_months must be a non-negative number`,
                    error: 'Validation error'
                };
            }
            if (typeof line.max_term_months !== 'number' || line.max_term_months < 0) {
                throw {
                    status: 400,
                    message: `Line ${i}: max_term_months must be a non-negative number`,
                    error: 'Validation error'
                };
            }
            if (line.max_term_months < line.min_term_months) {
                throw {
                    status: 400,
                    message: `Line ${i}: max_term_months must be >= min_term_months`,
                    error: 'Validation error'
                };
            }
            if (typeof line.min_amount !== 'number' || line.min_amount < 0) {
                throw {
                    status: 400,
                    message: `Line ${i}: min_amount must be a non-negative number`,
                    error: 'Validation error'
                };
            }
            if (typeof line.max_amount !== 'number' || line.max_amount < 0) {
                throw {
                    status: 400,
                    message: `Line ${i}: max_amount must be a non-negative number`,
                    error: 'Validation error'
                };
            }
            if (line.max_amount < line.min_amount) {
                throw {
                    status: 400,
                    message: `Line ${i}: max_amount must be >= min_amount`,
                    error: 'Validation error'
                };
            }
            if (typeof line.yield_percent !== 'number' || line.yield_percent < 0) {
                throw {
                    status: 400,
                    message: `Line ${i}: yield_percent must be a non-negative number`,
                    error: 'Validation error'
                };
            }
        }

        await settingsRepository.updateByKey('passive_income_yield', lines);
        return this.getPassiveIncomeYield();
    }

    /**
     * Найти подходящую линию доходности по сумме и сроку
     * @param {number} amount - Сумма
     * @param {number} termMonths - Срок в месяцах
     * @returns {Object|null} - Найденная линия или null
     */
    async findPassiveIncomeYieldLine(amount, termMonths) {
        const setting = await this.getPassiveIncomeYield();
        const lines = setting.lines;

        if (!lines || lines.length === 0) {
            return null;
        }

        // Ищем подходящую линию
        const line = lines.find(l =>
            amount >= l.min_amount &&
            amount <= l.max_amount &&
            termMonths >= l.min_term_months &&
            termMonths <= l.max_term_months
        );

        return line || null;
    }

    async calculatePdsCofinancing(yearlyContribution, avgMonthlyIncome) {
        // Получаем настройки
        const settings = await pdsSettingsRepository.find();
        if (!settings) {
            throw { 
                status: 500, 
                message: 'PDS cofinancing settings not configured',
                error: 'Configuration error'
            };
        }

        // Проверяем минимальный взнос
        if (yearlyContribution < settings.min_contribution_for_support_per_year) {
            return {
                bracket_id: null,
                cofin_coef: 0,
                state_cofin_amount: 0,
                message: `Минимальный взнос для софинансирования: ${settings.min_contribution_for_support_per_year} ₽/год`
            };
        }

        // Находим подходящий диапазон дохода
        const bracket = await pdsCofinIncomeBracketsRepository.findByIncome(avgMonthlyIncome);
        if (!bracket) {
            throw { 
                status: 404, 
                message: `No income bracket found for monthly income ${avgMonthlyIncome} ₽`,
                error: 'Bracket not found'
            };
        }

        // Рассчитываем коэффициент
        const cofinCoef = bracket.ratio_numerator / bracket.ratio_denominator;

        // Рассчитываем сумму софинансирования с учетом лимита
        const calculatedAmount = yearlyContribution * cofinCoef;
        const stateCofinAmount = Math.min(
            Math.floor(calculatedAmount), 
            settings.max_state_cofin_amount_per_year
        );

        return {
            bracket_id: bracket.id,
            cofin_coef: cofinCoef,
            state_cofin_amount: stateCofinAmount,
            yearly_contribution: yearlyContribution,
            avg_monthly_income: avgMonthlyIncome
        };
    }
}

module.exports = new SettingsService();
