const db = require('../config/database');

class PdsCofinIncomeBracketsRepository {
    /**
     * Получить все диапазоны доходов, отсортированные по income_from
     */
    async findAll() {
        return db('pds_cofin_income_brackets')
            .select('*')
            .orderBy('income_from', 'asc');
    }

    /**
     * Получить диапазон по ID
     */
    async findById(id) {
        return db('pds_cofin_income_brackets').where({ id }).first();
    }

    /**
     * Найти диапазон для конкретного среднемесячного дохода
     * @param {number} monthlyIncome - Среднемесячный доход (₽/мес)
     */
    async findByIncome(monthlyIncome) {
        return db('pds_cofin_income_brackets')
            .where('income_from', '<=', monthlyIncome)
            .where(function() {
                this.where('income_to', '>=', monthlyIncome)
                    .orWhereNull('income_to'); // NULL означает "нет верхней границы"
            })
            .orderBy('income_from', 'asc')
            .first();
    }

    /**
     * Создать новый диапазон
     */
    async create(bracketData) {
        const { income_from, income_to, ratio_numerator, ratio_denominator } = bracketData;
        
        const insertData = {
            income_from: parseInt(income_from),
            ratio_numerator: parseInt(ratio_numerator),
            ratio_denominator: parseInt(ratio_denominator)
        };
        
        if (income_to !== undefined && income_to !== null) {
            insertData.income_to = parseInt(income_to);
        } else {
            insertData.income_to = null;
        }

        const [id] = await db('pds_cofin_income_brackets').insert(insertData);
        return id;
    }

    /**
     * Обновить диапазон
     */
    async update(id, bracketData) {
        const updateData = {};
        
        if (bracketData.income_from !== undefined) {
            updateData.income_from = parseInt(bracketData.income_from);
        }
        if (bracketData.income_to !== undefined) {
            updateData.income_to = bracketData.income_to === null ? null : parseInt(bracketData.income_to);
        }
        if (bracketData.ratio_numerator !== undefined) {
            updateData.ratio_numerator = parseInt(bracketData.ratio_numerator);
        }
        if (bracketData.ratio_denominator !== undefined) {
            updateData.ratio_denominator = parseInt(bracketData.ratio_denominator);
        }
        
        updateData.updated_at = new Date();

        return db('pds_cofin_income_brackets')
            .where({ id })
            .update(updateData);
    }

    /**
     * Удалить диапазон
     */
    async delete(id) {
        return db('pds_cofin_income_brackets').where({ id }).del();
    }
}

module.exports = new PdsCofinIncomeBracketsRepository();

