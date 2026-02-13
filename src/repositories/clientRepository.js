const knex = require('../config/database');

class ClientRepository {
    async create(clientData, trx = null) {
        const query = knex('clients').insert(clientData);
        if (trx) query.transacting(trx);
        const [id] = await query;
        return id;
    }

    async findById(id, projectId = null, trx = null) {
        const query = knex('clients').where({ id });
        if (projectId) query.where({ project_id: projectId });
        if (trx) query.transacting(trx);
        return query.first();
    }

    async findByEmail(email, projectId = null, trx = null) {
        const query = knex('clients').where({ email });
        if (projectId) query.where({ project_id: projectId });
        if (trx) query.transacting(trx);
        return query.first();
    }

    async update(id, data, projectId = null, trx = null) {
        const query = knex('clients').where({ id });
        if (projectId) query.where({ project_id: projectId });
        if (trx) query.transacting(trx);
        return query.update(data);
    }

    // --- Related Entities ---

    async addAssets(assets, trx = null) {
        const query = knex('client_assets').insert(assets);
        if (trx) query.transacting(trx);
        return query;
    }

    async getAssets(clientId) {
        return knex('client_assets').where({ client_id: clientId });
    }

    async deleteAssets(clientId, trx = null) {
        const query = knex('client_assets').where({ client_id: clientId }).del();
        if (trx) query.transacting(trx);
        return query;
    }

    async addLiabilities(liabilities, trx = null) {
        const query = knex('client_liabilities').insert(liabilities);
        if (trx) query.transacting(trx);
        return query;
    }

    async getLiabilities(clientId) {
        return knex('client_liabilities').where({ client_id: clientId });
    }

    async deleteLiabilities(clientId, trx = null) {
        const query = knex('client_liabilities').where({ client_id: clientId }).del();
        if (trx) query.transacting(trx);
        return query;
    }

    async addExpenses(expenses, trx = null) {
        const query = knex('client_expenses').insert(expenses);
        if (trx) query.transacting(trx);
        return query;
    }

    async getExpenses(clientId) {
        return knex('client_expenses').where({ client_id: clientId });
    }

    async deleteExpenses(clientId, trx = null) {
        const query = knex('client_expenses').where({ client_id: clientId }).del();
        if (trx) query.transacting(trx);
        return query;
    }

    async addGoals(goals, trx = null) {
        const query = knex('goals').insert(goals);
        if (trx) query.transacting(trx);
        return query;
    }

    async updateGoal(clientId, goalId, data, trx = null) {
        const query = knex('goals').where({ id: goalId, client_id: clientId }).update(data);
        if (trx) query.transacting(trx);
        return query;
    }

    async getGoals(clientId) {
        return knex('goals').where({ client_id: clientId });
    }

    async deleteGoal(clientId, goalId, trx = null) {
        const query = knex('goals').where({ id: goalId, client_id: clientId }).del();
        if (trx) query.transacting(trx);
        return query;
    }

    async deleteGoals(clientId, trx = null) {
        const query = knex('goals').where({ client_id: clientId }).del();
        if (trx) query.transacting(trx);
        return query;
    }

    // --- Full Aggregate Fetch ---
    async getFullClientData(clientId) {
        const client = await this.findById(clientId);
        if (!client) return null;

        const [assets, liabilities, expenses, goals] = await Promise.all([
            this.getAssets(clientId),
            this.getLiabilities(clientId),
            this.getExpenses(clientId),
            this.getGoals(clientId)
        ]);

        const clientObj = {
            ...client,
            assets,
            liabilities,
            expenses,
            goals
        };

        if (typeof clientObj.goals_summary === 'string') {
            try {
                clientObj.goals_summary = JSON.parse(clientObj.goals_summary);
            } catch (e) {
                // ignore
            }
        }

        return clientObj;
    }

    async findAllByAgent(agentId, projectId = null, options = {}) {
        const { limit = null, page = 1, sort = 'created_at', order = 'desc', search = '' } = options;
        const offset = limit ? (page - 1) * limit : 0;

        // Base query
        let query = knex('clients').where({ agent_id: agentId });
        if (projectId) query.where({ project_id: projectId });

        // Apply search filter if provided
        if (search) {
            query = query.where(function () {
                this.where('first_name', 'like', `%${search}%`)
                    .orWhere('last_name', 'like', `%${search}%`)
                    .orWhere('middle_name', 'like', `%${search}%`)
                    .orWhere('phone', 'like', `%${search}%`)
                    .orWhere('email', 'like', `%${search}%`)
                    .orWhere('external_uuid', 'like', `%${search}%`);
            });
        }

        // Count total for pagination
        const countQuery = query.clone().count('id as total').first();
        const totalResult = await countQuery;
        const total = totalResult ? parseInt(totalResult.total) : 0;

        // Fetch data
        let finalQuery = query.select('*').orderBy(sort, order);

        if (limit) {
            finalQuery = finalQuery.limit(limit).offset(offset);
        }

        const data = await finalQuery;

        return {
            data,
            pagination: {
                total,
                page: limit ? parseInt(page) : 1,
                limit: limit ? parseInt(limit) : total,
                totalPages: limit ? Math.ceil(total / limit) : 1
            }
        };
    }
}

module.exports = new ClientRepository();
