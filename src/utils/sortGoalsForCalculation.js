/**
 * Порядок целей как в calculateFirstRun: priority (явное поле или по типу), затем term_months.
 * Должен совпадать с логикой расчёта smart allocation / риска.
 */
function getPriorityForCalculation(goal) {
    const name = (goal?.name || goal?.goal_name || '').toUpperCase();
    if (name.includes('РЕЗЕРВ') || name.includes('RESERVOIR')) return 1;

    const map = {
        7: 1,
        5: 2,
        3: 3,
        11: 3,
        1: 4,
        2: 5
    };
    return map[goal?.goal_type_id] ?? 5;
}

function compareGoalsForCalculation(goalA, goalB) {
    const pA = goalA.priority ?? getPriorityForCalculation(goalA);
    const pB = goalB.priority ?? getPriorityForCalculation(goalB);
    if (pA !== pB) return pA - pB;
    return (goalA.term_months || 0) - (goalB.term_months || 0);
}

function sortGoalsForCalculationOrder(goals) {
    if (!Array.isArray(goals)) return [];
    return [...goals].sort(compareGoalsForCalculation);
}

module.exports = {
    getPriorityForCalculation,
    compareGoalsForCalculation,
    sortGoalsForCalculationOrder
};
