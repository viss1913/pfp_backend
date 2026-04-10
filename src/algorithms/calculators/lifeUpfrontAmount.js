/**
 * Первый взнос НСЖ (LIFE): тот же контракт, что в LifeInsuranceCalculator —
 * вызов партнёрского API при наличии, иначе fallback-формулы.
 */

const nsjApiServiceSingleton = require('../../services/nsjApiService');

/**
 * @param {Object} goal
 * @param {Object} context
 * @returns {Promise<{ nsjResult: Object, apiError: Error|null }>}
 */
async function fetchLifeNsjResult(goal, context) {
    const nsjApiService = context?.services?.nsjApiService || nsjApiServiceSingleton;
    const termMonths = Number(goal.term_months || 120);
    const targetAmount = Number(goal.target_amount || 0);
    const nsjParams = {
        target_amount: targetAmount,
        term_months: termMonths,
        client: context?.client || {},
        payment_variant: goal.payment_variant || 12,
        program: goal.program || process.env.NSJ_DEFAULT_PROGRAM || 'test'
    };

    try {
        const nsjResult = await nsjApiService.calculateLifeInsurance(nsjParams);
        return { nsjResult, apiError: null };
    } catch (err) {
        const termY = Math.ceil(termMonths / 12);
        const fallbackAnnualPremium = termMonths > 0 ? (targetAmount * 12) / termMonths : targetAmount;
        const nsjResult = {
            success: true,
            _fallback: true,
            total_premium: fallbackAnnualPremium,
            term_years: termY,
            total_limit: targetAmount
        };
        return { nsjResult, apiError: err };
    }
}

/**
 * Первый платёж (уходит в initial / списание с пула).
 * @param {Object} goal
 * @param {Object} nsjResult
 * @returns {number}
 */
function deriveLifeCostNow(goal, nsjResult) {
    if (!nsjResult) return 0;

    const targetAmount = Number(goal.target_amount || 0);
    const totalPremium = Number(nsjResult.total_premium || targetAmount);
    if (!Number.isFinite(totalPremium) || totalPremium <= 0) return 0;

    // Business rule for smart allocation:
    // reserve full first-year LIFE premium from the shared pool, never /12.
    return totalPremium;
}

/**
 * @param {Object} goal
 * @param {Object} context
 * @returns {Promise<number>}
 */
async function getLifeFirstPaymentAmount(goal, context) {
    const { nsjResult } = await fetchLifeNsjResult(goal, context);
    return deriveLifeCostNow(goal, nsjResult);
}

module.exports = {
    fetchLifeNsjResult,
    deriveLifeCostNow,
    getLifeFirstPaymentAmount
};
