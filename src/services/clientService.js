const clientRepository = require('../repositories/clientRepository');
const projectRepository = require('../repositories/projectRepository');
const knex = require('../config/database');
const { mergeGoalsWithSnapshot } = require('../utils/mergeGoalsWithSnapshot');
const { enrichGoalsSummaryProductTypes } = require('../utils/enrichGoalsSummaryProductTypes');

function normalizeJsonField(value) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch (e) {
            return value;
        }
    }
    return value;
}

function serializeJsonField(value) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
}

/** Активы из тела first-run (client.assets) → строки таблицы client_assets */
function mapCalcAssetsToClientAssetRows(list) {
    if (!Array.isArray(list) || list.length === 0) return [];
    return list.map((a) => {
        const type = String(a.type || 'OTHER').slice(0, 50);
        const name = String(a.name || type || 'Актив').slice(0, 255);
        const currentValue = Number(a.current_value ?? a.amount ?? 0);
        return {
            type,
            name,
            current_value: currentValue,
            currency: 'RUB'
        };
    });
}

function ownerLabel(client) {
    if (!client.agent_id) return 'B2C';
    const email = client.agent_email;
    if (email) return email;
    const name = [client.agent_first_name, client.agent_last_name].filter(Boolean).join(' ').trim();
    if (name) return name;
    return `Агент #${client.agent_id}`;
}

function mapCreditToLiabilityRow(credit) {
    if (!credit || typeof credit !== 'object') return null;
    const type = String(credit.type || 'OTHER').slice(0, 50);
    const remainingAmount = Number(credit.balance ?? 0);
    const monthlyPayment = Number(credit.monthlyPayment ?? 0);
    const interestRate = Number(credit.rate ?? 0);

    return {
        type,
        name: String(credit.name || credit.type || 'Кредит').slice(0, 255),
        remaining_amount: Number.isFinite(remainingAmount) ? remainingAmount : 0,
        monthly_payment: Number.isFinite(monthlyPayment) ? monthlyPayment : 0,
        interest_rate: Number.isFinite(interestRate) ? interestRate : 0
    };
}

function mergeLiabilitiesWithCredits(payload) {
    const directLiabilities = Array.isArray(payload?.liabilities) ? payload.liabilities : [];
    const credits = Array.isArray(payload?.credits) ? payload.credits : [];
    if (credits.length === 0) return directLiabilities;

    const creditLiabilities = credits
        .map(mapCreditToLiabilityRow)
        .filter(Boolean);

    return [...directLiabilities, ...creditLiabilities];
}

function mapLiabilityToCredit(liability) {
    if (!liability || typeof liability !== 'object') return null;
    return {
        type: liability.type || 'OTHER',
        balance: Number(liability.remaining_amount ?? 0),
        monthlyPayment: Number(liability.monthly_payment ?? 0),
        rate: Number(liability.interest_rate ?? 0)
    };
}

function normalizeGoalRow(goal) {
    if (!goal || typeof goal !== 'object') return goal;

    let paramsObj = null;
    if (typeof goal.params === 'string' && goal.params.trim()) {
        try {
            paramsObj = JSON.parse(goal.params);
        } catch (_) {
            paramsObj = null;
        }
    } else if (goal.params && typeof goal.params === 'object') {
        paramsObj = goal.params;
    }

    const normalized = { ...goal };
    if (
        normalized.monthly_replenishment === undefined &&
        paramsObj &&
        paramsObj.monthly_replenishment !== undefined
    ) {
        normalized.monthly_replenishment = paramsObj.monthly_replenishment;
    }

    return normalized;
}

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
            delete clientData.insured_person;
            clientData.family_profile = serializeJsonField(normalizeJsonField(clientData.family_profile));

            if (clientData.tax_children !== undefined) {
                clientData.tax_children = serializeJsonField(
                    normalizeJsonField(clientData.tax_children)
                );
            }

            const nestedClientAssets = Array.isArray(clientData.assets) ? [...clientData.assets] : [];
            delete clientData.assets;
            const mergedCalcAssets = [
                ...(Array.isArray(data.assets) ? data.assets : []),
                ...nestedClientAssets
            ];

            // 1. Check if client exists by email (Upsert logic)
            if (clientData.email) {
                const existing = await clientRepository.findByEmail(clientData.email, null, trx);
                if (existing) {
                    clientId = existing.id;
                    await clientRepository.update(clientId, clientData, null, trx);

                    // Clear existing related data to replace with new data (Fresh Start)
                    await clientRepository.deleteAssets(clientId, trx);
                    await clientRepository.deleteLiabilities(clientId, trx);
                    await clientRepository.deleteExpenses(clientId, trx);
                    await clientRepository.deleteGoals(clientId, trx);
                }
            }

            // 2. Create if not found/no email
            if (!clientId) {
                // Security: ensure project_id is set. Fallback to agent's project if missing.
                if (!clientData.project_id && clientData.agent_id) {
                    const agent = await trx('agents').where({ id: clientData.agent_id }).first();
                    if (agent) {
                        clientData.project_id = agent.project_id;
                        console.log(`[ClientService] Set missing project_id ${agent.project_id} from agent ${agent.id}`);
                    }
                }
                clientId = await clientRepository.create(clientData, trx);
            }

            // 3. Add Related Data
            const assetRows = mapCalcAssetsToClientAssetRows(mergedCalcAssets);
            if (assetRows.length > 0) {
                const assets = assetRows.map((a) => ({ ...a, client_id: clientId }));
                await clientRepository.addAssets(assets, trx);
            }

            const normalizedLiabilities = mergeLiabilitiesWithCredits(data);
            if (normalizedLiabilities.length > 0) {
                const liabilities = normalizedLiabilities.map(l => ({ ...l, client_id: clientId }));
                await clientRepository.addLiabilities(liabilities, trx);
            }

            if (data.expenses && data.expenses.length > 0) {
                const expenses = data.expenses.map(e => ({ ...e, client_id: clientId }));
                await clientRepository.addExpenses(expenses, trx);
            }

            if (data.goals && data.goals.length > 0) {
                const goalColumns = [
                    'goal_type_id', 'name', 'target_amount', 'desired_monthly_income',
                    'term_months', 'end_date', 'initial_capital', 'monthly_replenishment', 'inflation_rate', 'risk_profile'
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
            goals: (goals || []).map(normalizeGoalRow),
            credits: liabilities.map(mapLiabilityToCredit).filter(Boolean)
        };

        if (typeof clientObj.goals_summary === 'string') {
            try {
                clientObj.goals_summary = JSON.parse(clientObj.goals_summary);
            } catch (e) {
                // ignore
            }
        }
        clientObj.family_profile = normalizeJsonField(clientObj.family_profile);
        clientObj.tax_children = normalizeJsonField(clientObj.tax_children);

        mergeGoalsWithSnapshot(clientObj);

        if (projectId) {
            try {
                await enrichGoalsSummaryProductTypes(clientObj, projectId);
            } catch (e) {
                console.warn('[ClientService] enrichGoalsSummaryProductTypes failed:', e.message);
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
        }, null, trx);

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
            clientData.family_profile = serializeJsonField(normalizeJsonField(clientData.family_profile));

            // Как в createFullClient: в БД first_name/last_name NOT NULL — экстракция/LLM часто шлёт null
            clientData.first_name = clientData.first_name || ' ';
            clientData.last_name = clientData.last_name || ' ';

            // 1. Update Profile
            await clientRepository.update(clientId, clientData, null, trx);

            // 2. Refresh Related Data (Clear and add new ones)
            if (data.assets) {
                await clientRepository.deleteAssets(clientId, trx);
                if (data.assets.length > 0) {
                    const assets = data.assets.map(a => ({ ...a, client_id: clientId }));
                    await clientRepository.addAssets(assets, trx);
                }
            }

            const hasLiabilitiesPayload = Object.prototype.hasOwnProperty.call(data, 'liabilities');
            const hasCreditsPayload = Object.prototype.hasOwnProperty.call(data, 'credits');
            if (hasLiabilitiesPayload || hasCreditsPayload) {
                const normalizedLiabilities = mergeLiabilitiesWithCredits(data);
                await clientRepository.deleteLiabilities(clientId, trx);
                if (normalizedLiabilities.length > 0) {
                    const liabilities = normalizedLiabilities.map(l => ({ ...l, client_id: clientId }));
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
                        'term_months', 'end_date', 'initial_capital', 'monthly_replenishment', 'inflation_rate', 'risk_profile'
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
        if (projectId) {
            const project = await projectRepository.findById(projectId);
            let settings = project?.settings;
            if (settings && typeof settings === 'string') {
                try { settings = JSON.parse(settings); } catch (_) { settings = null; }
            }
            const seeAll = settings && (settings.agents_see_all_clients === true || settings.client_visibility === 'all');
            if (seeAll) {
                const result = await clientRepository.findAllByProject(projectId, options);
                result.data = (result.data || []).map((c) => ({
                    ...c,
                    owner_label: ownerLabel(c)
                }));
                return result;
            }
        }
        return await clientRepository.findAllByAgent(agentId, projectId, options);
    }

    async addGoal(clientId, goalData) {
        const goalColumns = [
            'goal_type_id', 'name', 'target_amount', 'desired_monthly_income',
            'term_months', 'end_date', 'initial_capital', 'monthly_replenishment', 'inflation_rate', 'risk_profile'
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
            'term_months', 'end_date', 'initial_capital', 'monthly_replenishment', 'inflation_rate', 'risk_profile'
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
