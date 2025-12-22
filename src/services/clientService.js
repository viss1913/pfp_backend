const clientRepository = require('../repositories/clientRepository');
const knex = require('../config/database');

class ClientService {
    async createFullClient(data) {
        // data structure: { client: {...}, assets: [], liabilities: [], expenses: [], goals: [] }
        return await knex.transaction(async (trx) => {
            let clientId;
            const clientData = { ...data.client };

            // Handle name splitting if 'fio' is provided instead of first_name/last_name
            if (clientData.fio && (!clientData.first_name || !clientData.last_name)) {
                const parts = clientData.fio.trim().split(/\s+/);
                if (parts.length >= 2) {
                    clientData.last_name = clientData.last_name || parts[0];
                    clientData.first_name = clientData.first_name || parts[1];
                    clientData.middle_name = clientData.middle_name || parts.slice(2).join(' ') || null;
                } else if (parts.length === 1) {
                    clientData.first_name = clientData.first_name || parts[0];
                    clientData.last_name = clientData.last_name || ' '; // Database requires notNullable
                }
            }

            // Map sex/gender if needed
            if (clientData.sex && !clientData.gender) {
                clientData.gender = clientData.sex;
            }

            // Ensure required fields for DB
            clientData.first_name = clientData.first_name || ' ';
            clientData.last_name = clientData.last_name || ' ';

            // Remove non-DB fields
            delete clientData.fio;
            delete clientData.sex;


            // 1. Check if client exists by email (Upsert logic)
            if (clientData.email) {
                const existing = await clientRepository.findByEmail(clientData.email, trx);
                if (existing) {
                    clientId = existing.id;
                    await clientRepository.update(clientId, clientData, trx);

                    // Clear existing related data to replace with new data (Fresh Start)
                    await clientRepository.deleteAssets(clientId, trx);
                    await clientRepository.deleteLiabilities(clientId, trx);
                    await clientRepository.deleteExpenses(clientId, trx);
                    await clientRepository.deleteGoals(clientId, trx);
                }
            }

            // 2. Create if not found/no email
            if (!clientId) {
                clientId = await clientRepository.create(clientData, trx);
            }

            // 3. Add Related Data
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

            if (data.goals && data.goals.length > 0) {
                const goalColumns = [
                    'goal_type_id', 'name', 'target_amount', 'desired_monthly_income',
                    'term_months', 'end_date', 'initial_capital', 'inflation_rate', 'risk_profile'
                ];

                const goals = data.goals.map(g => {
                    const goalRecord = { client_id: clientId };
                    const params = {};

                    Object.keys(g).forEach(key => {
                        if (goalColumns.includes(key)) {
                            goalRecord[key] = g[key];
                        } else if (key !== 'client_id' && key !== 'id') {
                            params[key] = g[key];
                        }
                    });

                    if (Object.keys(params).length > 0) {
                        goalRecord.params = JSON.stringify(params);
                    }

                    return goalRecord;
                });
                await clientRepository.addGoals(goals, trx);
            }

            // 4. Recalculate Aggregates (Net Worth) and Update Client
            await this.updateFinancialAggregates(clientId, trx);

            return clientId;
        });
    }

    async getFullClient(id) {
        return await clientRepository.getFullClientData(id);
    }

    async updateClient(id, data) {
        return await clientRepository.update(id, data);
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
