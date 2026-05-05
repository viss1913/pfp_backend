/**
 * Опорная цель для единственного снимка risk_profile_result на клиенте:
 * нужен один term_months для calculateGoalProfile; не путать с пер-целевым расчётом в firstRun.
 */

const GOAL_TYPE_ID_PENSION = 1;
const GOAL_TYPE_ID_LIFE = 5;
const GOAL_TYPE_ID_FIN_RESERVE = 7;

const ALWAYS_EXCLUDE_FROM_RISK_REFERENCE = new Set([GOAL_TYPE_ID_FIN_RESERVE, GOAL_TYPE_ID_LIFE]);

function goalTypeId(goal) {
    const v = goal?.goal_type_id;
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

/**
 * @param {Array<object>} sortedGoals — уже sortGoalsForCalculationOrder
 * @returns {object} цель или { term_months: 120 }
 */
function pickReferenceGoalForRiskProfile(sortedGoals) {
    if (!Array.isArray(sortedGoals) || sortedGoals.length === 0) {
        return { term_months: 120 };
    }

    let pool = sortedGoals.filter((g) => Number(g?.term_months || 0) > 0);
    pool = pool.filter((g) => {
        const tid = goalTypeId(g);
        if (tid == null) return true;
        return !ALWAYS_EXCLUDE_FROM_RISK_REFERENCE.has(tid);
    });

    const hasNonPension = pool.some((g) => goalTypeId(g) !== GOAL_TYPE_ID_PENSION);
    if (hasNonPension) {
        pool = pool.filter((g) => goalTypeId(g) !== GOAL_TYPE_ID_PENSION);
    }

    if (pool.length === 0) {
        return { term_months: 120 };
    }

    let maxCap = -Infinity;
    for (const g of pool) {
        const c = Number(g.initial_capital ?? 0);
        if (Number.isFinite(c) && c > maxCap) maxCap = c;
    }
    if (!Number.isFinite(maxCap)) maxCap = 0;

    const atMax = pool.filter((g) => Number(g.initial_capital ?? 0) === maxCap);
    const atMaxSet = new Set(atMax);
    for (const g of sortedGoals) {
        if (atMaxSet.has(g)) return g;
    }
    return atMax[0];
}

module.exports = {
    GOAL_TYPE_ID_PENSION,
    GOAL_TYPE_ID_LIFE,
    GOAL_TYPE_ID_FIN_RESERVE,
    ALWAYS_EXCLUDE_FROM_RISK_REFERENCE,
    pickReferenceGoalForRiskProfile,
};
