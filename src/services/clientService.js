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

            // Map external UUID if provided
            if (clientData.uuid && !clientData.external_uuid) {
                clientData.external_uuid = clientData.uuid;
            }

            // Ensure required fields for DB
            clientData.first_name = clientData.first_name || ' ';
            clientData.last_name = clientData.last_name || ' ';

            // Remove non-DB fields
            delete clientData.fio;
            delete clientData.sex;
            delete clientData.uuid;


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

    async getFullClient(id, projectId = null) {
        const client = await clientRepository.findById(id, projectId);
        if (!client) return null;

        const [assets, liabilities, expenses, goals] = await Promise.all([
            clientRepository.getAssets(id),
            clientRepository.getLiabilities(id),
            clientRepository.getExpenses(id),
            clientRepository.getGoals(id)
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

    async updateClient(id, data, projectId = null) {
        return await clientRepository.update(id, data, projectId);
    }

    async updateFinancialAggregates(clientId, trx = null) {
        // Fetch fresh data (using transaction if provided, though repository methods here might need generic trx support or we assume read is safe)
        // For simplicity in this step, we just calculate from what we can fetch.
        // NOTE: In a real transaction, we should use the trx to fetch data to see uncommitted changes. 
        // Current repo implementation for 'get' doesn't support trx, so let's skip strict read-your-writes inside transaction for now
        // or just calculate based on what we just inserted if we had passed it.
        // Better approach: Do a raw query or update repo to valid aggregations.

        // Quick aggregation logic:
        let assetsQuery = knex('client_assets').where({ client_id: clientId });
        if (trx) assetsQuery = assetsQuery.transacting(trx);
        const assets = await assetsQuery;

        let liabilitiesQuery = knex('client_liabilities').where({ client_id: clientId });
        if (trx) liabilitiesQuery = liabilitiesQuery.transacting(trx);
        const liabilities = await liabilitiesQuery;

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

    async updateFullClient(clientId, data) {
        // Reuse createFullClient logic but forced for specific ID
        // Simplified version: delete and recreate related entities, update profile
        return await knex.transaction(async (trx) => {
            const clientData = { ...data.client };

            // Apply name parsing and mappings if present
            if (clientData.fio && (!clientData.first_name || !clientData.last_name)) {
                const parts = clientData.fio.trim().split(/\s+/);
                if (parts.length >= 2) {
                    clientData.last_name = clientData.last_name || parts[0];
                    clientData.first_name = clientData.first_name || parts[1];
                    clientData.middle_name = clientData.middle_name || parts.slice(2).join(' ') || null;
                } else if (parts.length === 1) {
                    clientData.first_name = clientData.first_name || parts[0];
                }
            }

            if (clientData.sex && !clientData.gender) clientData.gender = clientData.sex;
            if (clientData.uuid && !clientData.external_uuid) clientData.external_uuid = clientData.uuid;

            delete clientData.fio;
            delete clientData.sex;
            delete clientData.uuid;
            delete clientData.id;

            // 1. Update Profile
            await clientRepository.update(clientId, clientData, trx);

            // 2. Refresh Related Data (Clear and add new ones)
            if (data.assets) {
                await clientRepository.deleteAssets(clientId, trx);
                if (data.assets.length > 0) {
                    const assets = data.assets.map(a => ({ ...a, client_id: clientId }));
                    await clientRepository.addAssets(assets, trx);
                }
            }

            if (data.liabilities) {
                await clientRepository.deleteLiabilities(clientId, trx);
                if (data.liabilities.length > 0) {
                    const liabilities = data.liabilities.map(l => ({ ...l, client_id: clientId }));
                    await clientRepository.addLiabilities(liabilities, trx);
                }
            }

            if (data.expenses) {
                await clientRepository.deleteExpenses(clientId, trx);
                if (data.expenses.length > 0) {
                    const expenses = data.expenses.map(e => ({ ...e, client_id: clientId }));
                    await clientRepository.addExpenses(expenses, trx);
                }
            }

            if (data.goals) {
                await clientRepository.deleteGoals(clientId, trx);
                if (data.goals.length > 0) {
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
            }

            // 3. Recalculate Aggregates
            await this.updateFinancialAggregates(clientId, trx);

            return clientId;
        });
    }

    async getClientsByAgent(agentId, projectId = null, options = {}) {
        return await clientRepository.findAllByAgent(agentId, projectId, options);
    }

    async addGoal(clientId, goalData) {
        const goalColumns = [
            'goal_type_id', 'name', 'target_amount', 'desired_monthly_income',
            'term_months', 'end_date', 'initial_capital', 'inflation_rate', 'risk_profile'
        ];

        const goalRecord = { client_id: clientId };
        const params = {};

        Object.keys(goalData).forEach(key => {
            if (goalColumns.includes(key)) {
                goalRecord[key] = goalData[key];
            } else if (key !== 'client_id' && key !== 'id') {
                params[key] = goalData[key];
            }
        });

        if (Object.keys(params).length > 0) {
            goalRecord.params = JSON.stringify(params);
        }

        const id = await clientRepository.addGoals([goalRecord]);
        await this.updateFinancialAggregates(clientId);
        return id;
    }

    async updateGoal(clientId, goalId, goalData) {
        const goalColumns = [
            'goal_type_id', 'name', 'target_amount', 'desired_monthly_income',
            'term_months', 'end_date', 'initial_capital', 'inflation_rate', 'risk_profile'
        ];

        const goalRecord = {};
        const params = {};

        Object.keys(goalData).forEach(key => {
            if (goalColumns.includes(key)) {
                goalRecord[key] = goalData[key];
            } else if (key !== 'client_id' && key !== 'id' && key !== 'goal_id' && key !== 'params') {
                params[key] = goalData[key];
            }
        });

        if (Object.keys(params).length > 0) {
            // Need to merge with existing params if we want to be safe, 
            // but for simplicity we overwrite if it's a full update of the object
            goalRecord.params = JSON.stringify(params);
        }

        await clientRepository.updateGoal(clientId, goalId, goalRecord);
        await this.updateFinancialAggregates(clientId);
    }
    async deleteGoal(clientId, goalId) {
        await clientRepository.deleteGoal(clientId, goalId);
        return true;
    }
}

module.exports = new ClientService();
