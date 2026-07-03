const settingsRepository = require('../repositories/settingsRepository');
const tax2ndflRepository = require('../repositories/tax2ndflRepository');
const pdsSettingsRepository = require('../repositories/pdsSettingsRepository');
const pdsCofinIncomeBracketsRepository = require('../repositories/pdsCofinIncomeBracketsRepository');
const db = require('../config/database');

// Ключи, которые настраиваются агентом на уровне проекта (без глобальных дефолтов)
const AGENT_OWNED_SETTING_KEYS = [
    'inflation_rate_year',
    'inflation_rate_matrix',
    'investment_expense_growth_monthly',
    'investment_expense_growth_annual',
    'passive_income_yield',
    'report_finam'
];

const AGENT_OWNED_DEFAULTS = {
    inflation_rate_year: { description: 'Годовая инфляция по умолчанию (%)', category: 'calculation' },
    inflation_rate_matrix: { description: 'Матрица инфляции по месяцам', category: 'calculation' },
    investment_expense_growth_monthly: { description: 'Рост расходов на инвестиции (% в месяц)', category: 'calculation' },
    investment_expense_growth_annual: { description: 'Рост расходов на инвестиции (% годовых)', category: 'calculation' },
    passive_income_yield: { description: 'Линии доходности пассивного дохода', category: 'passive_income' },
    report_finam: { description: 'Версия отчёта Финам: 1 — текущий, 2 — v2', category: 'report' }
};

class SettingsService {
    async getAllSettings(projectId = null, category = null) {
        const settings = await settingsRepository.findAll(projectId, category);

        // Парсим значения для удобства
        return settings.map(s => ({
            key: s.key,
            value: this._parseValue(s.value, s.value_type),
            description: s.description,
            category: s.category,
            updated_at: s.updated_at,
            project_id: s.project_id
        }));
    }

    async getSettingByKey(key, projectId = null) {
        const setting = await settingsRepository.findByKey(key, projectId);
        if (!setting) throw { status: 404, message: 'Setting not found' };

        return {
            key: setting.key,
            value: this._parseValue(setting.value, setting.value_type),
            description: setting.description,
            category: setting.category,
            updated_at: setting.updated_at,
            project_id: setting.project_id
        };
    }

    async updateSetting(key, value, isAdmin, projectId = null) {
        // Админ может менять любые настройки; агент — только настройки своего проекта (projectId задан)
        if (!isAdmin && projectId == null) {
            throw { status: 403, message: 'Only admin can update settings' };
        }

        let setting = await settingsRepository.findByKey(key, projectId);
        if (!setting) {
            // Агент впервые задаёт настройку проекта из списка «только для проекта»
            if (projectId && AGENT_OWNED_SETTING_KEYS.includes(key)) {
                const meta = AGENT_OWNED_DEFAULTS[key] || { description: key, category: 'calculation' };
                await settingsRepository.create({ key, value, description: meta.description, category: meta.category }, projectId);
                await this._afterSettingUpdated(key, projectId);
                return this.getSettingByKey(key, projectId);
            }
            throw { status: 404, message: `Setting not found: ${key}. Check key name or run migrations.` };
        }

        if (projectId && setting.project_id == null && AGENT_OWNED_SETTING_KEYS.includes(key)) {
            const meta = AGENT_OWNED_DEFAULTS[key] || { description: key, category: setting.category || 'calculation' };
            await settingsRepository.create({ key, value, description: meta.description, category: meta.category }, projectId);
            await this._afterSettingUpdated(key, projectId);
            return this.getSettingByKey(key, projectId);
        }

        await settingsRepository.updateByKey(key, value, projectId);
        await this._afterSettingUpdated(key, projectId);
        return this.getSettingByKey(key, projectId);
    }

    async _afterSettingUpdated(key, projectId = null) {
        if (String(key) !== 'report_finam') return;
        const patch = {
            report_pdf_status: null,
            report_pdf_url: null,
            report_pdf_generated_at: null,
            report_pdf_error: null,
            report_pdf_updated_at: db.fn.now(),
        };
        const q = db('clients');
        if (projectId) q.where('project_id', projectId);
        await q.update(patch);
    }

    async createSetting(data, isAdmin, projectId = null) {
        if (!isAdmin) {
            throw { status: 403, message: 'Only admin can create settings' };
        }

        const existing = await settingsRepository.findByKey(data.key, projectId);
        if (existing && (existing.project_id === projectId || (!projectId && !existing.project_id))) {
            throw { status: 400, message: 'Setting with this key already exists for this project' };
        }

        const id = await settingsRepository.create(data, projectId);
        await this._afterSettingUpdated(data.key, projectId);
        return this.getSettingByKey(data.key, projectId);
    }

    async deleteSetting(key, isAdmin, projectId = null) {
        if (!isAdmin) {
            throw { status: 403, message: 'Only admin can delete settings' };
        }

        const setting = await settingsRepository.findByKey(key, projectId);
        if (!setting) throw { status: 404, message: 'Setting not found' };

        await settingsRepository.delete(key, projectId);
        await this._afterSettingUpdated(key, projectId);
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
    async getValue(key, projectId = null) {
        return settingsRepository.getValue(key, projectId);
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
    async getAllTaxBrackets(projectId = null) {
        return tax2ndflRepository.findAll(projectId);
    }

    /**
     * Получить налоговую ставку по ID
     */
    async getTaxBracketById(id, projectId = null) {
        const bracket = await tax2ndflRepository.findById(id, projectId);
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
    async getTaxBracketByIncome(income, projectId = null) {
        const bracket = await tax2ndflRepository.findByIncome(income, projectId);
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
    async createTaxBracket(data, isAdmin, projectId = null) {
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

        // Валидация: проверяем, что диапазоны не пересекаются в рамках одного проекта
        const existing = await tax2ndflRepository.findAll(projectId);
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

        const id = await tax2ndflRepository.create(data, projectId);
        return tax2ndflRepository.findById(id, projectId);
    }

    /**
     * Обновить налоговую ставку
     */
    async updateTaxBracket(id, data, isAdmin, projectId = null) {
        if (!isAdmin) {
            throw {
                status: 403,
                message: 'Only administrators can manage tax brackets',
                error: 'Forbidden'
            };
        }

        const existing = await tax2ndflRepository.findById(id, projectId);
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
        const allBrackets = await tax2ndflRepository.findAll(projectId);
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

        await tax2ndflRepository.update(id, data, projectId);
        return tax2ndflRepository.findById(id, projectId);
    }

    /**
     * Удалить налоговую ставку
     */
    async deleteTaxBracket(id, isAdmin, projectId = null) {
        if (!isAdmin) {
            throw {
                status: 403,
                message: 'Only administrators can manage tax brackets',
                error: 'Forbidden'
            };
        }

        const bracket = await tax2ndflRepository.findById(id, projectId);
        if (!bracket) {
            throw {
                status: 404,
                message: `Tax bracket with id ${id} not found`,
                error: 'Tax bracket not found'
            };
        }

        await tax2ndflRepository.delete(id, projectId);
        return { success: true };
    }

    /**
     * Создать несколько налоговых ставок за раз (bulk create)
     */
    async createTaxBracketsMany(brackets, isAdmin, projectId = null) {
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
        const existing = await tax2ndflRepository.findAll(projectId);
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
                order_index: bracket.order_index !== undefined && bracket.order_index !== null ? parseInt(bracket.order_index) : 0,
                project_id: projectId
            }));
            await trx('tax_2ndfl_brackets').insert(data);
        });

        return tax2ndflRepository.findAll(projectId);
    }

    // ========== Методы для работы с настройками ПДС софинансирования ==========

    /**
     * Получить настройки софинансирования ПДС
     */
    async getPdsCofinSettings(projectId = null) {
        const settings = await pdsSettingsRepository.find(projectId);
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
    async updatePdsCofinSettings(data, isAdmin, projectId = null) {
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

        await pdsSettingsRepository.update(data, projectId);
        return pdsSettingsRepository.find(projectId);
    }

    // ========== Методы для работы с шкалой доходов ПДС ==========

    /**
     * Получить все диапазоны доходов для софинансирования ПДС
     */
    async getAllPdsCofinIncomeBrackets(projectId = null) {
        return pdsCofinIncomeBracketsRepository.findAll(projectId);
    }

    /**
     * Получить диапазон по ID
     */
    async getPdsCofinIncomeBracketById(id, projectId = null) {
        const bracket = await pdsCofinIncomeBracketsRepository.findById(id, projectId);
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
    async createPdsCofinIncomeBracket(data, isAdmin, projectId = null) {
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
        const existing = await pdsCofinIncomeBracketsRepository.findAll(projectId);
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

        const id = await pdsCofinIncomeBracketsRepository.create(data, projectId);
        return pdsCofinIncomeBracketsRepository.findById(id, projectId);
    }

    /**
     * Обновить диапазон доходов
     */
    async updatePdsCofinIncomeBracket(id, data, isAdmin, projectId = null) {
        if (!isAdmin) {
            throw {
                status: 403,
                message: 'Only administrators can manage PDS cofinancing income brackets',
                error: 'Forbidden'
            };
        }

        const existing = await pdsCofinIncomeBracketsRepository.findById(id, projectId);
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
        const allBrackets = await pdsCofinIncomeBracketsRepository.findAll(projectId);
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

        await pdsCofinIncomeBracketsRepository.update(id, data, projectId);
        return pdsCofinIncomeBracketsRepository.findById(id, projectId);
    }

    /**
     * Удалить диапазон доходов
     */
    async deletePdsCofinIncomeBracket(id, isAdmin, projectId = null) {
        if (!isAdmin) {
            throw {
                status: 403,
                message: 'Only administrators can manage PDS cofinancing income brackets',
                error: 'Forbidden'
            };
        }

        const bracket = await pdsCofinIncomeBracketsRepository.findById(id, projectId);
        if (!bracket) {
            throw {
                status: 404,
                message: `PDS cofinancing income bracket with id ${id} not found`,
                error: 'Bracket not found'
            };
        }

        await pdsCofinIncomeBracketsRepository.delete(id, projectId);
        return { success: true };
    }

    /**
     * Рассчитать размер софинансирования ПДС
     * @param {number} yearlyContribution - Годовой взнос (₽)
     * @param {number} avgMonthlyIncome - Среднемесячный доход ДО НДФЛ (₽/мес)
     * @returns {Promise<Object>} Результат расчета
     */
    // ========== Методы для работы с линиями доходности пассивного дохода ==========

    /** Дефолтные линии доходности, если агент ещё не настроил по проекту */
    static get DEFAULT_PASSIVE_INCOME_YIELD_LINES() {
        return [
            { min_term_months: 0, max_term_months: 360, min_amount: 0, max_amount: 1000000000000, yield_percent: 14.0 },
        ];
    }

    /**
     * Получить все линии доходности для пассивного дохода (для проекта или глобально).
     * Если настройки нет — возвращаем дефолт, чтобы расчёты не падали и агент мог сохранить свои значения.
     */
    async getPassiveIncomeYield(projectId = null) {
        const setting = await settingsRepository.findByKey('passive_income_yield', projectId);
        if (!setting) {
            return {
                lines: SettingsService.DEFAULT_PASSIVE_INCOME_YIELD_LINES,
                updated_at: null,
                project_id: projectId
            };
        }
        return {
            lines: this._parseValue(setting.value, setting.value_type),
            updated_at: setting.updated_at,
            project_id: setting.project_id
        };
    }

    /**
     * Обновить линии доходности для пассивного дохода.
     * Админ — любые; агент — только своего проекта (projectId задан).
     */
    async updatePassiveIncomeYield(lines, isAdmin, projectId = null) {
        if (!isAdmin && projectId == null) {
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
            if (line.gender !== undefined && line.gender !== null && line.gender !== '') {
                const normalizedGender = this.normalizePensionGender(line.gender);
                if (!normalizedGender) {
                    throw {
                        status: 400,
                        message: `Line ${i}: gender must be male or female`,
                        error: 'Validation error'
                    };
                }
                line.gender = normalizedGender;
            } else {
                line.gender = null;
            }
            if (line.age !== undefined && line.age !== null && line.age !== '') {
                const age = parseInt(line.age, 10);
                if (!Number.isFinite(age) || age < 18 || age > 120) {
                    throw {
                        status: 400,
                        message: `Line ${i}: age must be an integer between 18 and 120`,
                        error: 'Validation error'
                    };
                }
                line.age = age;
            } else {
                line.age = null;
            }
        }

        const setting = await settingsRepository.findByKey('passive_income_yield', projectId);
        const meta = AGENT_OWNED_DEFAULTS.passive_income_yield;

        if (!setting) {
            if (!projectId) {
                throw { status: 403, message: 'Only project-scoped or admin update allowed' };
            }
            await settingsRepository.create({
                key: 'passive_income_yield',
                value: lines,
                description: meta.description,
                category: meta.category,
            }, projectId);
        } else if (projectId && setting.project_id == null) {
            // Глобальная строка есть, проектной нет — агент задаёт свои линии (как updateSetting).
            await settingsRepository.create({
                key: 'passive_income_yield',
                value: lines,
                description: meta.description,
                category: meta.category,
            }, projectId);
        } else {
            await settingsRepository.updateByKey('passive_income_yield', lines, projectId);
        }
        return this.getPassiveIncomeYield(projectId);
    }

    _passiveIncomeLineSpecificityScore(line) {
        let score = 0;
        if (line.gender != null) score += 2;
        if (line.age != null) score += 2;
        return score;
    }

    _passiveIncomeLineMatches(line, amount, termMonths, byTermOnly, clientGender, clientAge, useDemographics) {
        if (termMonths < line.min_term_months || termMonths > line.max_term_months) {
            return false;
        }
        if (!byTermOnly && (amount < line.min_amount || amount > line.max_amount)) {
            return false;
        }
        if (useDemographics) {
            if (line.gender != null && line.gender !== clientGender) return false;
            if (line.age != null && line.age !== clientAge) return false;
        } else if (line.gender != null || line.age != null) {
            return false;
        }
        return true;
    }

    /**
     * Найти подходящую линию доходности по сумме, сроку и (опционально) полу/возрасту.
     * @param {number} amount - Сумма капитала (₽)
     * @param {number} termMonths - Срок в месяцах
     * @param {boolean} byTermOnly - Если true, искать только по сроку, игнорируя сумму
     * @param {number|null} projectId
     * @param {{ gender?: string, age?: number }} [filters] - для пенсии: пол и возраст на пенсии
     */
    async findPassiveIncomeYieldLine(amount, termMonths, byTermOnly = false, projectId = null, filters = {}) {
        const setting = await this.getPassiveIncomeYield(projectId);
        const lines = setting.lines;

        if (!lines || lines.length === 0) {
            return null;
        }

        const useDemographics = filters.gender !== undefined || filters.age !== undefined;
        const clientGender = filters.gender !== undefined
            ? this.normalizePensionGender(filters.gender)
            : null;
        const clientAge = filters.age !== undefined ? parseInt(filters.age, 10) : null;

        if (useDemographics && filters.gender !== undefined && !clientGender) {
            return null;
        }
        if (useDemographics && filters.age !== undefined && !Number.isFinite(clientAge)) {
            return null;
        }

        const candidates = lines.filter((line) => this._passiveIncomeLineMatches(
            line,
            amount,
            termMonths,
            byTermOnly,
            clientGender,
            clientAge,
            useDemographics
        ));

        if (candidates.length === 0) {
            return null;
        }

        candidates.sort((a, b) => this._passiveIncomeLineSpecificityScore(b) - this._passiveIncomeLineSpecificityScore(a));
        return candidates[0];
    }

    normalizePensionGender(sex) {
        const value = String(sex || '').toLowerCase().trim();
        if (value === 'male' || value === 'm' || value === 'мужской') return 'male';
        if (value === 'female' || value === 'f' || value === 'женский') return 'female';
        return null;
    }

    /**
     * Доходность фазы выплат для пенсии: матрица passive_income_yield (срок + капитал + пол + возраст).
     */
    async resolvePensionPayoutYield({ amount, gender, ageAtGoal, monthsToPension, projectId = null }) {
        const payoutYieldLine = await this.findPassiveIncomeYieldLine(
            amount,
            monthsToPension,
            false,
            projectId,
            { gender, age: ageAtGoal }
        );
        if (!payoutYieldLine) return null;

        return {
            payoutYieldPercent: parseFloat(payoutYieldLine.yield_percent),
            payoutYieldSource: 'passive_income_yield',
            payoutLine: payoutYieldLine,
        };
    }

    async calculatePdsCofinancing(yearlyContribution, avgMonthlyIncome, overrideMaxAmount = null, cachedData = null, projectId = null) {
        // 1. Получаем настройки (из кэша или БД)
        let settings;
        if (cachedData && cachedData.pdsSettings) {
            settings = cachedData.pdsSettings;
        } else {
            settings = await pdsSettingsRepository.find(projectId);
        }

        if (!settings) {
            throw {
                status: 500,
                message: 'PDS cofinancing settings not configured',
                error: 'Configuration error'
            };
        }

        // 2. Проверяем минимальный взнос
        if (yearlyContribution < settings.min_contribution_for_support_per_year) {
            return {
                bracket_id: null,
                cofin_coef: 0,
                state_cofin_amount: 0,
                message: `Минимальный взнос для софинансирования: ${settings.min_contribution_for_support_per_year} ₽/год`
            };
        }

        // 3. Находим подходящий диапазон дохода (из кэша или БД)
        let bracket;
        if (cachedData && cachedData.pdsBrackets) {
            // Имитация логики репозитория findByIncome
            // brackets должны быть отсортированы или мы просто ищем первый попавшийся
            // Обычно в БД ищет where income_from <= X and (income_to >= X or income_to is null)
            bracket = cachedData.pdsBrackets.find(b => {
                const upLimit = (b.income_to === null) ? Infinity : b.income_to;
                return avgMonthlyIncome >= b.income_from && avgMonthlyIncome <= upLimit;
            });
        } else {
            bracket = await pdsCofinIncomeBracketsRepository.findByIncome(avgMonthlyIncome, projectId);
        }

        if (!bracket) {
            // Если диапазон не найден, это штатная ситуация (нет софинансирования для такого дохода?)
            // Или ошибка конфигурации. Считаем что ошибка, т.к. диапазоны должны покрывать всё.
            throw {
                status: 404,
                message: `No income bracket found for monthly income ${avgMonthlyIncome} ₽`,
                error: 'Bracket not found'
            };
        }

        // Рассчитываем коэффициент
        const cofinCoef = bracket.ratio_numerator / bracket.ratio_denominator;

        // Рассчитываем сумму софинансирования с учетом лимита (базового или переданного)
        const limit = overrideMaxAmount !== null ? overrideMaxAmount : settings.max_state_cofin_amount_per_year;
        const calculatedAmount = yearlyContribution * cofinCoef;
        const stateCofinAmount = Math.min(
            Math.floor(calculatedAmount),
            limit
        );

        return {
            bracket_id: bracket.id,
            cofin_coef: cofinCoef,
            state_cofin_amount: stateCofinAmount
        };
    }
}

module.exports = new SettingsService();
