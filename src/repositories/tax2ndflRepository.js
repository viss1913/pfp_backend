const db = require('../config/database');

class Tax2ndflRepository {
    /**
     * Получить все налоговые ставки, отсортированные по order_index
     */
    async findAll() {
        return db('tax_2ndfl_brackets')
            .select('*')
            .orderBy('order_index', 'asc')
            .orderBy('income_from', 'asc');
    }

    /**
     * Получить налоговую ставку по ID
     */
    async findById(id) {
        return db('tax_2ndfl_brackets').where({ id }).first();
    }

    /**
     * Найти налоговую ставку для конкретного дохода
     * @param {number} income - Годовой доход
     */
    async findByIncome(income) {
        return db('tax_2ndfl_brackets')
            .where('income_from', '<=', income)
            .where('income_to', '>=', income)
            .orderBy('order_index', 'asc')
            .first();
    }

    /**
     * Создать новую налоговую ставку
     */
    async create(bracketData) {
        const { income_from, income_to, rate, order_index, description } = bracketData;
        
        const [id] = await db('tax_2ndfl_brackets').insert({
            income_from: parseFloat(income_from),
            income_to: parseFloat(income_to),
            rate: parseFloat(rate),
            order_index: order_index !== undefined && order_index !== null ? parseInt(order_index) : 0,
            description: description || null
        });

        return id;
    }

    /**
     * Обновить налоговую ставку
     */
    async update(id, bracketData) {
        const { income_from, income_to, rate, order_index, description } = bracketData;
        
        const updateData = {};
        if (income_from !== undefined) updateData.income_from = parseFloat(income_from);
        if (income_to !== undefined) updateData.income_to = parseFloat(income_to);
        if (rate !== undefined) updateData.rate = parseFloat(rate);
        if (order_index !== undefined) updateData.order_index = parseInt(order_index);
        if (description !== undefined) updateData.description = description;
        
        updateData.updated_at = new Date();

        return db('tax_2ndfl_brackets')
            .where({ id })
            .update(updateData);
    }

    /**
     * Удалить налоговую ставку
     */
    async delete(id) {
        return db('tax_2ndfl_brackets').where({ id }).del();
    }

    /**
     * Удалить все налоговые ставки (для сброса)
     */
    async deleteAll() {
        return db('tax_2ndfl_brackets').del();
    }

    /**
     * Создать несколько налоговых ставок за раз (bulk insert)
     */
    async createMany(brackets) {
        const data = brackets.map(bracket => ({
            income_from: parseFloat(bracket.income_from),
            income_to: parseFloat(bracket.income_to),
            rate: parseFloat(bracket.rate),
            order_index: bracket.order_index !== undefined && bracket.order_index !== null ? parseInt(bracket.order_index) : 0,
            description: bracket.description || null
        }));

        return db('tax_2ndfl_brackets').insert(data);
    }
}

module.exports = new Tax2ndflRepository();


