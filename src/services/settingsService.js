const settingsRepository = require('../repositories/settingsRepository');
const tax2ndflRepository = require('../repositories/tax2ndflRepository');

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
}

module.exports = new SettingsService();
