const db = require('../config/database');

class Tax2ndflRepository {
    /**
     * Получить все налоговые ставки, отсортированные по order_index
     */
    async findAll(projectId = null) {
        const query = db('tax_2ndfl_brackets').select('*');

        query.where((builder) => {
            if (projectId) {
                builder.where('project_id', projectId);
                builder.orWhereNull('project_id');
            } else {
                builder.whereNull('project_id');
            }
        });

        return query
            .orderBy('order_index', 'asc')
            .orderBy('income_from', 'asc');
    }

    /**
     * Получить налоговую ставку по ID
     */
    async findById(id, projectId = null) {
        const query = db('tax_2ndfl_brackets').where({ id });
        if (projectId) {
            query.where((builder) => {
                builder.where('project_id', projectId).orWhereNull('project_id');
            });
        } else {
            query.whereNull('project_id');
        }
        return query.first();
    }

    /**
     * Найти налоговую ставку для конкретного дохода
     * @param {number} income - Годовой доход
     */
    async findByIncome(income, projectId = null) {
        const query = db('tax_2ndfl_brackets')
            .where('income_from', '<=', income)
            .where('income_to', '>=', income);

        query.where((builder) => {
            if (projectId) {
                builder.where('project_id', projectId).orWhereNull('project_id');
            } else {
                builder.whereNull('project_id');
            }
        });

        return query
            .orderBy('project_id', 'desc') // Project specific first
            .orderBy('order_index', 'asc')
            .first();
    }

    /**
     * Создать новую налоговую ставку
     */
    async create(bracketData, projectId = null) {
        const { income_from, income_to, rate, order_index } = bracketData;

        const [id] = await db('tax_2ndfl_brackets').insert({
            income_from: parseFloat(income_from),
            income_to: parseFloat(income_to),
            rate: parseFloat(rate),
            order_index: order_index !== undefined && order_index !== null ? parseInt(order_index) : 0,
            project_id: projectId
        });

        return id;
    }

    /**
     * Обновить налоговую ставку
     */
    async update(id, bracketData, projectId = null) {
        const { income_from, income_to, rate, order_index } = bracketData;

        const updateData = {};
        if (income_from !== undefined) updateData.income_from = parseFloat(income_from);
        if (income_to !== undefined) updateData.income_to = parseFloat(income_to);
        if (rate !== undefined) updateData.rate = parseFloat(rate);
        if (order_index !== undefined) updateData.order_index = parseInt(order_index);

        updateData.updated_at = new Date();

        const query = db('tax_2ndfl_brackets').where({ id });
        if (projectId) {
            query.where('project_id', projectId);
        } else {
            query.whereNull('project_id');
        }

        return query.update(updateData);
    }

    /**
     * Удалить налоговую ставку
     */
    async delete(id, projectId = null) {
        const query = db('tax_2ndfl_brackets').where({ id });
        if (projectId) {
            query.where('project_id', projectId);
        } else {
            query.whereNull('project_id');
        }
        return query.del();
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
    async createMany(brackets, projectId = null) {
        const data = brackets.map(bracket => ({
            income_from: parseFloat(bracket.income_from),
            income_to: parseFloat(bracket.income_to),
            rate: parseFloat(bracket.rate),
            order_index: bracket.order_index !== undefined && bracket.order_index !== null ? parseInt(bracket.order_index) : 0,
            project_id: projectId
        }));

        return db('tax_2ndfl_brackets').insert(data);
    }
}

module.exports = new Tax2ndflRepository();


