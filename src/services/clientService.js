const clientRepository = require('../repositories/clientRepository');
const knex = require('../config/database');

class ClientService {
    async createFullClient(data) {
        // data structure: { client: {...}, assets: [], liabilities: [], expenses: [], goals: [] }
        return await knex.transaction(async (trx) => {
            // 1. Create Base Client
            const clientId = await clientRepository.create(data.client, trx);

            // 2. Add Related Data if present
            if (data.assets && data.assets.length > 0) {
                const assets = data.assets.map(a => ({ ...a, client_id: clientId }));
                await clientRepository.addAssets(assets, trx);
            }

            if (data.liabilities && data.liabilities.length > 0) {
                const liabilities = data.liabilities.map(l => ({ ...l, client_id: clientId }));
                await clientRepository.addLiabilities(liabilities, trx);
            }

            if (data.expenses && data.expenses.length > 0) {
                const expenses = data.expenses.map(e => ({ ...e, client_id: clientId }));
                await clientRepository.addExpenses(expenses, trx);
            }

            // 3. Recalculate Aggregates (Net Worth) and Update Client
            await this.updateFinancialAggregates(clientId, trx);

            return clientId;
        });
    }

    async getFullClient(id) {
        return await clientRepository.getFullClientData(id);
    }

    async updateFinancialAggregates(clientId, trx = null) {
        // Fetch fresh data (using transaction if provided, though repository methods here might need generic trx support or we assume read is safe)
        // For simplicity in this step, we just calculate from what we can fetch.
        // NOTE: In a real transaction, we should use the trx to fetch data to see uncommitted changes. 
        // Current repo implementation for 'get' doesn't support trx, so let's skip strict read-your-writes inside transaction for now
        // or just calculate based on what we just inserted if we had passed it.
        // Better approach: Do a raw query or update repo to valid aggregations.

        // Quick aggregation logic:
        const assets = await knex('client_assets').where({ client_id: clientId }).transacting(trx || undefined);
        const liabilities = await knex('client_liabilities').where({ client_id: clientId }).transacting(trx || undefined);

        const assetsTotal = assets.reduce((sum, item) => sum + Number(item.current_value || 0), 0);
        const liabilitiesTotal = liabilities.reduce((sum, item) => sum + Number(item.remaining_amount || 0), 0);
        const netWorth = assetsTotal - liabilitiesTotal;

        await clientRepository.update(clientId, {
            assets_total: assetsTotal,
            liabilities_total: liabilitiesTotal,
            net_worth: netWorth
        }, trx);

        return { assetsTotal, liabilitiesTotal, netWorth };
    }
}

module.exports = new ClientService();
