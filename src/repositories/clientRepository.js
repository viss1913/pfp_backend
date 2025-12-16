const knex = require('../config/database');

class ClientRepository {
    async create(clientData, trx = null) {
        const query = knex('clients').insert(clientData);
        if (trx) query.transacting(trx);
        const [id] = await query;
        return id;
    }

    async findById(id) {
        return knex('clients').where({ id }).first();
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
}

module.exports = new ClientRepository();
