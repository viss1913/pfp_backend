const clientRepository = require('../repositories/clientRepository');
const projectRepository = require('../repositories/projectRepository');
const knex = require('../config/database');
const agentNetworkService = require('./agentNetworkService');
const commissionService = require('./commissionService');
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

function liabilityDedupeKey(row) {
    const type = String(row?.type || 'OTHER').toLowerCase();
    const remaining = Math.round(Number(row?.remaining_amount ?? 0));
    const monthly = Math.round(Number(row?.monthly_payment ?? 0));
    return `${type}|${remaining}|${monthly}`;
}

function dedupeLiabilityRows(rows) {
    const seen = new Set();
    const out = [];
    for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const key = liabilityDedupeKey(row);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(row);
    }
    return out;
}

/** credits — алиас liabilities (OpenAPI); не склеивать оба массива, иначе долги в отчёте ×2. */
function mergeLiabilitiesWithCredits(payload) {
    const credits = Array.isArray(payload?.credits) ? payload.credits : [];
    if (credits.length > 0) {
        return credits.map(mapCreditToLiabilityRow).filter(Boolean);
    }

    const fromClient = Array.isArray(payload?.client?.liabilities) ? payload.client.liabilities : [];
    const rootLiabilities = Array.isArray(payload?.liabilities) ? payload.liabilities : [];
    return dedupeLiabilityRows([...fromClient, ...rootLiabilities]);
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

const CLIENT_PATCH_FORBIDDEN_KEYS = new Set([
    'agent_id',
    'user_id',
    'project_id',
    'goals_summary',
    'id',
    'assets',
    'liabilities',
    'assets_total',
    'liabilities_total',
    'net_worth',
    'created_at',
    'updated_at',
]);

function deepMergePlainObjects(base, patch) {
    if (patch === undefined) return base;
    if (patch === null) return null;
    if (typeof patch !== 'object' || Array.isArray(patch)) return patch;
    const baseObj = base && typeof base === 'object' && !Array.isArray(base) ? base : {};
    const out = { ...baseObj };
    for (const key of Object.keys(patch)) {
        const patchVal = patch[key];
        if (patchVal === undefined) continue;
        if (Array.isArray(patchVal)) {
            out[key] = patchVal;
        } else if (patchVal && typeof patchVal === 'object') {
            out[key] = deepMergePlainObjects(baseObj[key], patchVal);
        } else {
            out[key] = patchVal;
        }
    }
    return out;
}

function stripClientPatchForbiddenFields(obj) {
    if (!obj || typeof obj !== 'object') return;
    for (const key of CLIENT_PATCH_FORBIDDEN_KEYS) {
        delete obj[key];
    }
}

function prepareClientRowForDb(clientData, { ensureNameDefaults = false } = {}) {
    const row = { ...clientData };

    if (row.fio && (!row.first_name || !row.last_name)) {
        const parts = row.fio.trim().split(/\s+/);
        if (parts.length >= 2) {
            row.last_name = row.last_name || parts[0];
            row.first_name = row.first_name || parts[1];
            row.middle_name = row.middle_name || parts.slice(2).join(' ') || null;
        } else if (parts.length === 1) {
            row.first_name = row.first_name || parts[0];
        }
    }

    if (row.sex && !row.gender) row.gender = row.sex;
    if (row.uuid && !row.external_uuid) row.external_uuid = row.uuid;

    delete row.fio;
    delete row.sex;
    delete row.uuid;
    delete row.insured_person;

    if (row.family_profile !== undefined) {
        row.family_profile = serializeJsonField(normalizeJsonField(row.family_profile));
    }
    if (row.risk_profile_answers !== undefined) {
        row.risk_profile_answers = serializeJsonField(normalizeJsonField(row.risk_profile_answers));
    }
    if (row.risk_profile_result !== undefined) {
        row.risk_profile_result = serializeJsonField(normalizeJsonField(row.risk_profile_result));
    }
    if (row.tax_children !== undefined) {
        row.tax_children = serializeJsonField(normalizeJsonField(row.tax_children));
    }

    if (ensureNameDefaults) {
        row.first_name = row.first_name || ' ';
        row.last_name = row.last_name || ' ';
    }

    return row;
}

function mergeClientPatchWithExisting(existingRow, patch) {
    if (!patch || typeof patch !== 'object') return null;

    const merged = { ...existingRow };
    const patchCopy = { ...patch };
    stripClientPatchForbiddenFields(patchCopy);

    const nestedAssets = Array.isArray(patchCopy.assets) ? patchCopy.assets : null;
    delete patchCopy.assets;
    const nestedLiabilities = Array.isArray(patchCopy.liabilities) ? patchCopy.liabilities : null;
    delete patchCopy.liabilities;

    for (const key of Object.keys(patchCopy)) {
        if (patchCopy[key] === undefined) continue;
        if (key === 'family_profile') {
            const existingFp = normalizeJsonField(merged.family_profile);
            merged.family_profile = deepMergePlainObjects(existingFp, patchCopy.family_profile);
        } else if (key === 'tax_children') {
            merged.tax_children = patchCopy.tax_children;
        } else if (key === 'risk_profile_answers' || key === 'risk_profile_result') {
            const existingVal = normalizeJsonField(merged[key]);
            const patchVal = patchCopy[key];
            merged[key] =
                patchVal && typeof patchVal === 'object' && !Array.isArray(patchVal)
                    ? deepMergePlainObjects(existingVal, patchVal)
                    : patchVal;
        } else {
            merged[key] = patchCopy[key];
        }
    }

    return { mergedRow: merged, nestedAssets, nestedLiabilities };
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
        let createdNewClient = false;
        const clientIdResult = await knex.transaction(async (trx) => {
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
            clientData.risk_profile_answers = serializeJsonField(normalizeJsonField(clientData.risk_profile_answers));
            clientData.risk_profile_result = serializeJsonField(normalizeJsonField(clientData.risk_profile_result));

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

            if (!clientData.project_id && clientData.agent_id) {
                const agentRow = await trx("agents").where({ id: clientData.agent_id }).first();
                if (agentRow) clientData.project_id = agentRow.project_id;
            }

            // 1. Check if client exists by email (Upsert logic)
            if (clientData.email) {
                const existing = await clientRepository.findByEmail(clientData.email, clientData.project_id || null, trx);
                if (existing) {
                    clientId = existing.id;
                    await clientRepository.update(clientId, clientData, clientData.project_id || null, trx);

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
                if (clientData.agent_id && clientData.referred_by_agent_id == null) {
                    clientData.referred_by_agent_id = await agentNetworkService.resolveReferredByAgentId(
                        clientData.agent_id,
                        trx
                    );
                }
                clientId = await clientRepository.create(clientData, trx);
                createdNewClient = true;
            }

            // 3. Add Related Data
            const assetRows = mapCalcAssetsToClientAssetRows(mergedCalcAssets);
            if (assetRows.length > 0) {
                const assets = assetRows.map((a) => ({ ...a, client_id: clientId }));
                await clientRepository.addAssets(assets, trx);
            }

            const normalizedLiabilities = mergeLiabilitiesWithCredits({
                client: data.client,
                liabilities: data.liabilities,
                credits: data.credits
            });
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
                    'term_months', 'end_date', 'initial_capital', 'monthly_replenishment', 'inflation_rate', 'risk_profile',
                    'risk_profile_extended'
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

        if (createdNewClient && clientIdResult) {
            knex('clients')
                .where({ id: clientIdResult })
                .first()
                .then((client) => {
                    if (!client?.agent_id) return null;
                    return knex('agents').where({ id: client.agent_id }).first().then((agent) => ({
                        client,
                        agent,
                    }));
                })
                .then((ctx) => {
                    if (!ctx?.client) return;
                    const beneficiary = ctx.agent?.parent_agent_id
                        ? Number(ctx.agent.parent_agent_id)
                        : null;
                    if (!beneficiary) return;
                    return commissionService.recordCommissionEvent({
                        projectId: ctx.client.project_id,
                        eventType: 'client_created',
                        agentId: Number(ctx.client.agent_id),
                        beneficiaryAgentId: beneficiary,
                        clientId: Number(ctx.client.id),
                    });
                })
                .catch((err) => console.error('[ClientService] commission client_created failed:', err));
        }

        return clientIdResult;
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
        clientObj.risk_profile_answers = normalizeJsonField(clientObj.risk_profile_answers);
        clientObj.risk_profile_result = normalizeJsonField(clientObj.risk_profile_result);

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

    /**
     * Сохранить снимок ПФП с generated_at и обновить clients.updated_at.
     * @param {number} id
     * @param {object} calculationResponse
     * @param {number|null} projectId
     */
    async persistGoalsSummary(id, calculationResponse, projectId = null) {
        const {
            stampGoalsSummarySnapshot,
            stringifyGoalsSummarySnapshot,
        } = require('../utils/goalsSummaryPersist');
        const stamped = stampGoalsSummarySnapshot(calculationResponse);
        await this.updateClient(
            id,
            { goals_summary: stringifyGoalsSummarySnapshot(stamped) },
            projectId
        );
        return stamped;
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

    /**
     * Частичное или полное обновление клиента и связанных сущностей.
     * Top-level ключи (assets, goals, …) меняются только если присутствуют в data.
     * @param {number|string} clientId
     * @param {object} data
     * @param {{ existingClient?: object|null, projectId?: number|null, ensureNameDefaults?: boolean }} [options]
     */
    async patchFullClient(clientId, data, options = {}) {
        const numericId = Number(clientId);
        if (!Number.isFinite(numericId) || numericId <= 0) {
            throw new Error('Invalid clientId');
        }

        let existingRow = options.existingClient;
        if (!existingRow) {
            existingRow = await clientRepository.findById(numericId, options.projectId ?? null);
        }
        if (!existingRow) {
            const err = new Error('Client not found');
            err.status = 404;
            throw err;
        }

        const payload = data && typeof data === 'object' ? data : {};

        return await knex.transaction(async (trx) => {
            let assetsPayload = payload.assets;
            let liabilitiesPayload = payload.liabilities;

            if (payload.client && typeof payload.client === 'object') {
                const mergeResult = mergeClientPatchWithExisting(existingRow, payload.client);
                if (mergeResult) {
                    const { mergedRow, nestedAssets, nestedLiabilities } = mergeResult;
                    if (nestedAssets) assetsPayload = nestedAssets;
                    if (nestedLiabilities) liabilitiesPayload = nestedLiabilities;

                    const clientData = prepareClientRowForDb(mergedRow, {
                        ensureNameDefaults: options.ensureNameDefaults === true,
                    });
                    stripClientPatchForbiddenFields(clientData);
                    delete clientData.id;

                    const updatePayload = {};
                    for (const key of Object.keys(clientData)) {
                        if (clientData[key] !== undefined) {
                            updatePayload[key] = clientData[key];
                        }
                    }
                    if (Object.keys(updatePayload).length > 0) {
                        await clientRepository.update(numericId, updatePayload, null, trx);
                    }
                }
            }

            if (assetsPayload !== undefined) {
                await clientRepository.deleteAssets(numericId, trx);
                if (assetsPayload.length > 0) {
                    const assets = assetsPayload.map((a) => ({ ...a, client_id: numericId }));
                    await clientRepository.addAssets(assets, trx);
                }
            }

            const hasLiabilitiesPayload = Object.prototype.hasOwnProperty.call(payload, 'liabilities');
            const hasCreditsPayload = Object.prototype.hasOwnProperty.call(payload, 'credits');
            if (hasLiabilitiesPayload || hasCreditsPayload || liabilitiesPayload !== undefined) {
                const normalizedLiabilities = mergeLiabilitiesWithCredits({
                    client: payload.client,
                    liabilities: liabilitiesPayload ?? payload.liabilities,
                    credits: payload.credits,
                });
                await clientRepository.deleteLiabilities(numericId, trx);
                if (normalizedLiabilities.length > 0) {
                    const liabilities = normalizedLiabilities.map((l) => ({ ...l, client_id: numericId }));
                    await clientRepository.addLiabilities(liabilities, trx);
                }
            }

            if (Object.prototype.hasOwnProperty.call(payload, 'expenses')) {
                await clientRepository.deleteExpenses(numericId, trx);
                if (payload.expenses.length > 0) {
                    const expenses = payload.expenses.map((e) => ({ ...e, client_id: numericId }));
                    await clientRepository.addExpenses(expenses, trx);
                }
            }

            if (Object.prototype.hasOwnProperty.call(payload, 'goals')) {
                await clientRepository.deleteGoals(numericId, trx);
                if (payload.goals.length > 0) {
                    const goalColumns = [
                        'goal_type_id', 'name', 'target_amount', 'desired_monthly_income',
                        'term_months', 'end_date', 'initial_capital', 'monthly_replenishment', 'inflation_rate', 'risk_profile',
                        'risk_profile_extended',
                    ];

                    const goals = payload.goals.map((g) => {
                        const goalRecord = { client_id: numericId };
                        const params = {};

                        Object.keys(g).forEach((key) => {
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

            await this.updateFinancialAggregates(numericId, trx);
            return numericId;
        });
    }

    async updateFullClient(clientId, data, projectId = null) {
        const numericId = Number(clientId);
        const existingRow = await clientRepository.findById(numericId, projectId);
        const hasClientPatch = data?.client && typeof data.client === 'object';
        const ensureNameDefaults =
            !existingRow ||
            (hasClientPatch &&
                (Object.prototype.hasOwnProperty.call(data.client, 'first_name') ||
                    Object.prototype.hasOwnProperty.call(data.client, 'last_name') ||
                    Object.prototype.hasOwnProperty.call(data.client, 'fio')));

        return this.patchFullClient(numericId, data, {
            existingClient: existingRow,
            projectId,
            ensureNameDefaults,
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
            'term_months', 'end_date', 'initial_capital', 'monthly_replenishment', 'inflation_rate', 'risk_profile',
            'risk_profile_extended'
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
            'term_months', 'end_date', 'initial_capital', 'monthly_replenishment', 'inflation_rate', 'risk_profile',
            'risk_profile_extended'
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

    /**
     * Удаляет дубликаты в client_liabilities (тип + остаток + платёж) и пересчитывает net_worth.
     * Для клиентов, сохранённых до фикса mergeLiabilitiesWithCredits (долги ×2 в отчёте).
     */
    async repairClientLiabilitiesDuplicates(clientId) {
        const id = Number(clientId);
        if (!Number.isFinite(id) || id <= 0) {
            throw new Error('Invalid clientId');
        }
        const liabilities = await clientRepository.getLiabilities(id);
        const deduped = dedupeLiabilityRows(liabilities);
        if (deduped.length === liabilities.length) {
            await this.updateFinancialAggregates(id);
            return { changed: false, before: liabilities.length, after: deduped.length };
        }

        const rowsForInsert = deduped.map((row) => ({
            client_id: id,
            type: String(row.type || 'OTHER').slice(0, 50),
            name: String(row.name || row.type || 'Кредит').slice(0, 255),
            remaining_amount: Number(row.remaining_amount ?? 0),
            monthly_payment: Number(row.monthly_payment ?? 0),
            interest_rate: Number(row.interest_rate ?? 0),
        }));

        await knex.transaction(async (trx) => {
            await clientRepository.deleteLiabilities(id, trx);
            if (rowsForInsert.length > 0) {
                await clientRepository.addLiabilities(rowsForInsert, trx);
            }
            await this.updateFinancialAggregates(id, trx);
        });

        return { changed: true, before: liabilities.length, after: deduped.length };
    }
}

const clientServiceInstance = new ClientService();
clientServiceInstance.mergeLiabilitiesWithCredits = mergeLiabilitiesWithCredits;
module.exports = clientServiceInstance;
