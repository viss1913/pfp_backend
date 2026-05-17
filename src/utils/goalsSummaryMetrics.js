/**
 * Metrics from clients.goals_summary (calculation snapshot after first-run / recalculate).
 */

const LIFE_GOAL_TYPE_ID = 5;
const LIFE_GOAL_TYPE = 'LIFE';

const INVESTMENT_GOAL_TYPE_IDS = new Set([1, 2, 3, 4, 6, 7]);
const INVESTMENT_GOAL_TYPES = new Set([
    'PENSION',
    'PASSIVE_INCOME',
    'INVESTMENT',
    'OTHER',
    'GOS_PENSION',
    'FIN_RESERVE',
]);

const CRM_STATUSES = ['THINKING', 'BOUGHT', 'REFUSED', 'RENEWAL'];

function roundRub(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
}

function toNum(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

/**
 * @param {unknown} stored — clients.goals_summary (string или object)
 * @returns {{ summary?: object, goals?: array }|null}
 */
function parseGoalsSummary(stored) {
    if (stored == null || stored === '') return null;
    let raw = stored;
    if (typeof stored === 'string') {
        try {
            raw = JSON.parse(stored);
        } catch {
            return null;
        }
    }
    const calc = raw.calculation || raw;
    if (!calc || typeof calc !== 'object') return null;
    const goals = Array.isArray(calc.goals) ? calc.goals : [];
    if (!goals.length && !calc.summary) return null;
    return {
        summary: calc.summary || null,
        goals,
    };
}

function isLifeGoal(goal) {
    if (!goal || typeof goal !== 'object') return false;
    const typeId = Number(goal.goal_type_id);
    if (typeId === LIFE_GOAL_TYPE_ID) return true;
    return String(goal.goal_type || '').toUpperCase() === LIFE_GOAL_TYPE;
}

function isInvestmentGoal(goal) {
    if (!goal || typeof goal !== 'object') return false;
    if (isLifeGoal(goal)) return false;
    const typeId = Number(goal.goal_type_id);
    if (Number.isFinite(typeId) && INVESTMENT_GOAL_TYPE_IDS.has(typeId)) return true;
    const code = String(goal.goal_type || '').toUpperCase();
    return INVESTMENT_GOAL_TYPES.has(code);
}

function extractLifePremiums(goal) {
    const details = goal.details && typeof goal.details === 'object' ? goal.details : {};
    const nsj =
        details.nsj_calculation && typeof details.nsj_calculation === 'object'
            ? details.nsj_calculation
            : goal.nsj_calculation && typeof goal.nsj_calculation === 'object'
              ? goal.nsj_calculation
              : {};

    const annual = toNum(details.annual_premium ?? nsj.annual_premium);
    let contract = toNum(nsj.total_premium ?? details.total_premium);
    if (contract <= 0 && annual > 0) {
        const term = toNum(goal.term_months ?? goal.summary?.target_months ?? details.term_months);
        if (term > 0) contract = annual * (term / 12);
    }

    return { annual, contract };
}

function goalTermMonths(goal) {
    const t = goal.term_months ?? goal.summary?.target_months ?? goal.details?.term_months;
    const n = Number(t);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function investmentCapitalFromGoal(goal) {
    const summary = goal.summary && typeof goal.summary === 'object' ? goal.summary : {};
    const fromSummary = toNum(summary.initial_capital);
    if (fromSummary > 0) return fromSummary;
    return toNum(goal.initial_capital);
}

/**
 * @param {unknown} goalsSummaryStored
 * @returns {{
 *   has_plan: boolean,
 *   nsj_annual_premium_rub: number,
 *   nsj_contract_premium_rub: number,
 *   has_life_goal: boolean,
 *   investment_capital_rub: number,
 *   term_months_list: number[],
 * }}
 */
function aggregateGoalsSummaryMetrics(goalsSummaryStored) {
    const parsed = parseGoalsSummary(goalsSummaryStored);
    const out = {
        has_plan: false,
        nsj_annual_premium_rub: 0,
        nsj_contract_premium_rub: 0,
        has_life_goal: false,
        investment_capital_rub: 0,
        term_months_list: [],
    };
    if (!parsed) return out;

    out.has_plan = true;
    for (const goal of parsed.goals) {
        const term = goalTermMonths(goal);
        if (term != null) out.term_months_list.push(term);

        if (isLifeGoal(goal)) {
            out.has_life_goal = true;
            const life = extractLifePremiums(goal);
            out.nsj_annual_premium_rub += life.annual;
            out.nsj_contract_premium_rub += life.contract;
        } else if (isInvestmentGoal(goal)) {
            out.investment_capital_rub += investmentCapitalFromGoal(goal);
        }
    }

    out.nsj_annual_premium_rub = roundRub(out.nsj_annual_premium_rub);
    out.nsj_contract_premium_rub = roundRub(out.nsj_contract_premium_rub);
    out.investment_capital_rub = roundRub(out.investment_capital_rub);
    return out;
}

function emptyCrmCounts() {
    return { THINKING: 0, BOUGHT: 0, REFUSED: 0, RENEWAL: 0 };
}

/**
 * @param {Array<{ goals_summary?: unknown, crm_status?: string, updated_at?: Date|string, created_at?: Date|string }>} clients
 */
function aggregateClientsMetrics(clients = []) {
    const crm = emptyCrmCounts();
    let clientsWithPlan = 0;
    let nsjAnnual = 0;
    let nsjContract = 0;
    let nsjClients = 0;
    let investmentCapital = 0;
    const termMonthsList = [];
    let lastClientAt = null;

    for (const client of clients) {
        const status = String(client.crm_status || 'THINKING').toUpperCase();
        if (Object.prototype.hasOwnProperty.call(crm, status)) {
            crm[status] += 1;
        } else {
            crm.THINKING += 1;
        }

        const ts = client.updated_at || client.created_at;
        if (ts) {
            const d = new Date(ts);
            if (!Number.isNaN(d.getTime()) && (!lastClientAt || d > lastClientAt)) {
                lastClientAt = d;
            }
        }

        const g = aggregateGoalsSummaryMetrics(client.goals_summary);
        if (g.has_plan) clientsWithPlan += 1;
        if (g.has_life_goal) nsjClients += 1;
        nsjAnnual += g.nsj_annual_premium_rub;
        nsjContract += g.nsj_contract_premium_rub;
        investmentCapital += g.investment_capital_rub;
        termMonthsList.push(...g.term_months_list);
    }

    let avgTermMonths = null;
    if (termMonthsList.length) {
        const sum = termMonthsList.reduce((a, b) => a + b, 0);
        avgTermMonths = Math.round((sum / termMonthsList.length) * 10) / 10;
    }

    return {
        clients_count: clients.length,
        clients_with_plan_count: clientsWithPlan,
        nsj_annual_premium_rub: roundRub(nsjAnnual),
        nsj_contract_premium_rub: roundRub(nsjContract),
        nsj_clients_count: nsjClients,
        investment_capital_rub: roundRub(investmentCapital),
        avg_term_months: avgTermMonths,
        crm,
        last_client_at: lastClientAt ? lastClientAt.toISOString() : null,
    };
}

function averageSubagentTermMonths(subagentMetricsList) {
    const values = subagentMetricsList
        .map((m) => m.avg_term_months)
        .filter((v) => v != null && Number.isFinite(Number(v)));
    if (!values.length) return null;
    const sum = values.reduce((a, b) => a + Number(b), 0);
    return Math.round((sum / values.length) * 10) / 10;
}

/**
 * @param {Array<{ metrics: object }>} rows
 */
function buildNetworkSummary(rows) {
    const summary = {
        subagents_count: rows.length,
        clients_count: 0,
        clients_with_plan_count: 0,
        nsj_annual_premium_rub: 0,
        nsj_contract_premium_rub: 0,
        nsj_clients_count: 0,
        investment_capital_rub: 0,
        avg_term_months: null,
    };

    for (const row of rows) {
        const m = row.metrics || {};
        summary.clients_count += m.clients_count || 0;
        summary.clients_with_plan_count += m.clients_with_plan_count || 0;
        summary.nsj_annual_premium_rub += m.nsj_annual_premium_rub || 0;
        summary.nsj_contract_premium_rub += m.nsj_contract_premium_rub || 0;
        summary.nsj_clients_count += m.nsj_clients_count || 0;
        summary.investment_capital_rub += m.investment_capital_rub || 0;
    }

    summary.nsj_annual_premium_rub = roundRub(summary.nsj_annual_premium_rub);
    summary.nsj_contract_premium_rub = roundRub(summary.nsj_contract_premium_rub);
    summary.investment_capital_rub = roundRub(summary.investment_capital_rub);
    summary.avg_term_months = averageSubagentTermMonths(rows.map((r) => r.metrics));

    return summary;
}

module.exports = {
    LIFE_GOAL_TYPE_ID,
    LIFE_GOAL_TYPE,
    CRM_STATUSES,
    parseGoalsSummary,
    isLifeGoal,
    isInvestmentGoal,
    aggregateGoalsSummaryMetrics,
    aggregateClientsMetrics,
    buildNetworkSummary,
    roundRub,
};
