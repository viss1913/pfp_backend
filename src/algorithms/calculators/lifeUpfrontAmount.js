/**
 * Первый взнос НСЖ (LIFE): тот же контракт, что в LifeInsuranceCalculator —
 * вызов партнёрского API при наличии, иначе fallback-формулы.
 */

const nsjApiServiceSingleton = require('../../services/nsjApiService');
/** Finam (14), АТБ (28), SBER (29) — один упрощённый NSJ-shape для графика/премии. */
const NSJ_FINAM_STYLE_PROJECT_IDS = new Set([14, 28, 29]);
const SBER_LIFE_TARIFF = 0.0144;

/**
 * @param {Object} goal
 * @param {Object} context
 * @returns {Promise<{ nsjResult: Object, apiError: Error|null }>}
 */
async function fetchLifeNsjResult(goal, context) {
    // Resolut (project RESOLUT_PROJECT_ID): needs context.agentUserId (agent JWT → calculationService)
    // or RESOLUT_STATIC_KEY on server. Report/cabinet flows without both → catch below + _fallback premium.
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

    const resolutPid = Number(process.env.RESOLUT_PROJECT_ID || 0);
    const ctxProjectId =
        context?.projectId != null
            ? Number(context.projectId)
            : (context?.client?.project_id != null ? Number(context.client.project_id) : null);
    const agentUserId = context?.agentUserId != null ? Number(context.agentUserId) : null;

    if (ctxProjectId != null && NSJ_FINAM_STYLE_PROJECT_IDS.has(ctxProjectId)) {
        const annualPremium = Math.round(targetAmount * SBER_LIFE_TARIFF * 100) / 100;
        return {
            nsjResult: {
                success: true,
                total_premium: annualPremium,
                term_years: 15,
                total_limit: targetAmount,
                program: 'Подушка безопасности',
                risks: [
                    { risk_name: 'Травмы', limit_amount: Math.round(targetAmount * 0.3) },
                    {
                        risk_name: 'Инвалидность I-II группы в результате несчастного случая или болезни',
                        limit_amount: Math.round(targetAmount)
                    },
                    { risk_name: 'Уход из жизни по любой причине', limit_amount: Math.round(targetAmount) },
                    { risk_name: 'Уход из жизни в результате несчастного случая', limit_amount: Math.round(targetAmount) },
                    { risk_name: 'Уход из жизни в результате ДТП', limit_amount: Math.round(targetAmount) }
                ]
            },
            apiError: null
        };
    }

    try {
        if (resolutPid && ctxProjectId === resolutPid) {
            const { quoteLifeAsNsjShape } = require('../../services/resolutNsjQuoteService');
            const nsjResult = await quoteLifeAsNsjShape(
                nsjParams,
                ctxProjectId,
                Number.isFinite(agentUserId) ? agentUserId : null
            );
            return { nsjResult, apiError: null };
        }
        const nsjResult = await nsjApiService.calculateLifeInsurance(nsjParams);
        return { nsjResult, apiError: null };
    } catch (err) {
        const msg = err && (err.message || err.details?.upstream_err_message || err.error) ? String(err.message || err.details?.upstream_err_message || err.error) : String(err);
        console.warn('[fetchLifeNsjResult] NSJ/Resolut failed, fallback premium:', msg);
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
