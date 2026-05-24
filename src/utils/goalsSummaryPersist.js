/**
 * Сохранение снимка goals_summary с меткой времени пересчёта.
 */

/**
 * @param {object} calculationResponse — ответ calculateFirstRun
 * @param {Date|string} [at] — момент пересчёта (по умолчанию now)
 * @returns {object}
 */
function stampGoalsSummarySnapshot(calculationResponse, at = new Date()) {
    const iso = at instanceof Date ? at.toISOString() : new Date(at).toISOString();
    const base =
        calculationResponse && typeof calculationResponse === 'object'
            ? { ...calculationResponse }
            : {};
    base.generated_at = iso;
    if (base.calculation && typeof base.calculation === 'object') {
        base.calculation = { ...base.calculation, generated_at: iso };
    }
    return base;
}

/**
 * @param {object} calculationResponse
 * @param {Date|string} [at]
 * @returns {string}
 */
function stringifyGoalsSummarySnapshot(calculationResponse, at = new Date()) {
    return JSON.stringify(stampGoalsSummarySnapshot(calculationResponse, at));
}

module.exports = {
    stampGoalsSummarySnapshot,
    stringifyGoalsSummarySnapshot,
};
