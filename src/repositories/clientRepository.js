const knex = require('../config/database');

class ClientRepository {
    async create(clientData, trx = null) {
        const query = knex('clients').insert(clientData);
        if (trx) query.transacting(trx);
        const [id] = await query;
        return id;
    }

    async findById(id, trx = null) {
        const query = knex('clients').where({ id }).first();
        if (trx) query.transacting(trx);
        return query;
    }

    async findByEmail(email, trx = null) {
        const query = knex('clients').where({ email }).first();
        if (trx) query.transacting(trx);
        return query;
    }

    async update(id, data, trx = null) {
        const query = knex('clients').where({ id }).update(data);
        if (trx) query.transacting(trx);
        return query;
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

    async getGoals(clientId) {
        return knex('goals').where({ client_id: clientId });
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

        return {
            ...client,
            assets,
            liabilities,
            expenses,
            goals
        };
    }

    async findAllByAgent(agentId, options = {}) {
        const { limit = 20, page = 1, sort = 'created_at', order = 'desc' } = options;
        const offset = (page - 1) * limit;

        // Base query
        const query = knex('clients')
            .where({ agent_id: agentId });

        // Count total for pagination
        const countQuery = query.clone().count('id as total').first();
        const totalResult = await countQuery;
        const total = totalResult ? parseInt(totalResult.total) : 0;

        // Fetch paginated data
        const data = await query
            .select('*')
            .orderBy(sort, order)
            .limit(limit)
            .offset(offset);

        return {
            data,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit)
            }
        };
    }
}

module.exports = new ClientRepository();
