const db = require('../config/database');

class PdsCofinIncomeBracketsRepository {
    /**
     * Получить все диапазоны доходов, отсортированные по income_from
     */
    async findAll(projectId = null) {
        const query = db('pds_cofin_income_brackets').select('*');

        query.where((builder) => {
            if (projectId) {
                builder.where('project_id', projectId).orWhereNull('project_id');
            } else {
                builder.whereNull('project_id');
            }
        });

        return query.orderBy('income_from', 'asc');
    }

    /**
     * Получить диапазон по ID
     */
    async findById(id, projectId = null) {
        const query = db('pds_cofin_income_brackets').where({ id });
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
     * Найти диапазон для конкретного среднемесячного дохода
     * @param {number} monthlyIncome - Среднемесячный доход (₽/мес)
     */
    async findByIncome(monthlyIncome, projectId = null) {
        const query = db('pds_cofin_income_brackets')
            .where('income_from', '<=', monthlyIncome)
            .where(function () {
                this.where('income_to', '>=', monthlyIncome)
                    .orWhereNull('income_to');
            });

        query.where((builder) => {
            if (projectId) {
                builder.where('project_id', projectId).orWhereNull('project_id');
            } else {
                builder.whereNull('project_id');
            }
        });

        return query
            .orderBy('project_id', 'desc')
            .orderBy('income_from', 'asc')
            .first();
    }

    /**
     * Создать новый диапазон
     */
    async create(bracketData, projectId = null) {
        const { income_from, income_to, ratio_numerator, ratio_denominator } = bracketData;

        const insertData = {
            income_from: parseInt(income_from),
            ratio_numerator: parseInt(ratio_numerator),
            ratio_denominator: parseInt(ratio_denominator),
            project_id: projectId
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
    async update(id, bracketData, projectId = null) {
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

        const query = db('pds_cofin_income_brackets').where({ id });
        if (projectId) {
            query.where('project_id', projectId);
        } else {
            query.whereNull('project_id');
        }

        return query.update(updateData);
    }

    /**
     * Удалить диапазон
     */
    async delete(id, projectId = null) {
        const query = db('pds_cofin_income_brackets').where({ id });
        if (projectId) {
            query.where('project_id', projectId);
        } else {
            query.whereNull('project_id');
        }
        return query.del();
    }
}

module.exports = new PdsCofinIncomeBracketsRepository();

