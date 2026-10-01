/**
 * Первый взнос НСЖ (LIFE): тот же контракт, что в LifeInsuranceCalculator —
 * вызов партнёрского API при наличии, иначе fallback-формулы.
 */

const nsjApiServiceSingleton = require('../../services/nsjApiService');
const {
    fixedLifeTermYearsForProject,
    IMMERS_TEST_FINAM_PROJECT_ID,
    resolveLifeTermMonths,
} = require('./lifeTermDefaults');
const { isSberLifeCalcProject } = require('./sberLifeProjectIds');
const { buildSberPodushkaNsjResult } = require('./sberPodushkaActuarial');
const SBER_LIFE_TARIFF = 0.0144;

/**
 * Годовой взнос НСЖ: лимит дожития / делитель из карточки продукта (для ПСБ это 15).
 * @param {number} limitAmount
 * @param {number} divisor
 * @returns {number|null}
 */
function premiumFromSurvivalLimit(limitAmount, divisor) {
    const limit = Number(limitAmount);
    const div = Number(divisor);
    if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(div) || div <= 0) return null;
    return Math.round((limit / div) * 100) / 100;
}

function parseProductLines(raw) {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    }
    return [];
}

/**
 * Строка тарифа «Добра наживешь»: term_years 5–25.
 * Пустой срок — 20 лет. Короче 5 и длиннее 25 прижимаются к границе таблицы.
 */
function pickTermTariffLine(lines, termMonths) {
    const table = parseProductLines(lines).filter((line) => Number(line && line.term_years) > 0 && line.premium_tariff != null);
    if (!table.length) return null;
    const months = Number(termMonths);
    let years = Number.isFinite(months) && months > 0 ? Math.round(months / 12) : 20;
    if (years < 5) years = 5;
    if (years > 25) years = 25;
    const line = table.find((row) => Number(row.term_years) === years) || table.find((row) => Number(row.term_years) === 20);
    return line ? { line, years: Number(line.term_years) } : null;
}

function isSingleLifePayment(paymentVariant) {
    return paymentVariant === 0 || paymentVariant === '0' || paymentVariant === 'once' || paymentVariant === 'single';
}

/**
 * Проектный НСЖ. Сначала тариф по сроку (premium_tariff), иначе старый premium_divisor.
 * Нет такого продукта — null, дальше старая ветка.
 */
async function catalogNsjResult(projectId, targetAmount, termMonths, paymentVariant) {
    if (projectId == null) return null;
    const db = require('../../config/database');
    const rows = await db('products')
        .where({ project_id: projectId, product_type: 'NSZH', is_active: 1 })
        .whereNull('agent_id');
    for (const row of rows) {
        const lines = parseProductLines(row.lines);
        const picked = pickTermTariffLine(lines, termMonths);
        if (picked) {
            const single = isSingleLifePayment(paymentVariant);
            const tariff = Number(single ? (picked.line.single_tariff ?? picked.line.premium_tariff) : picked.line.premium_tariff);
            const sum = Number(targetAmount);
            if (Number.isFinite(tariff) && tariff > 0 && Number.isFinite(sum) && sum > 0) {
                const limit = Math.round(sum);
                return {
                    success: true,
                    _catalog: true,
                    product_id: row.id,
                    total_premium: Math.round(sum * tariff),
                    term_years: picked.years,
                    term_months: picked.years * 12,
                    total_limit: limit,
                    tariff,
                    payment_frequency: single ? 'once' : 'annual',
                    program: row.name,
                    risks: [
                        { risk_name: 'Дожитие', limit_amount: limit },
                        { risk_name: 'Смерть ЛП' },
                        { risk_name: 'Смерть НС' },
                        { risk_name: 'Смерть ДТП' },
                        { risk_name: 'Телемедицина' },
                        { risk_name: 'Инвалидность ОУСВ' },
                    ],
                };
            }
        }
        const divisor = lines.length ? Number(lines[0] && lines[0].premium_divisor) : NaN;
        const annual = premiumFromSurvivalLimit(targetAmount, divisor);
        if (annual == null) continue;
        const termYears = Math.max(1, Math.ceil(Number(termMonths || 0) / 12) || 1);
        const limit = Math.round(Number(targetAmount));
        return {
            success: true,
            _catalog: true,
            product_id: row.id,
            total_premium: annual,
            term_years: termYears,
            term_months: termYears * 12,
            total_limit: limit,
            program: row.name,
            risks: [
                { risk_name: 'Дожитие', limit_amount: limit },
                { risk_name: 'Уход из жизни (любая причина)', limit_amount: limit },
            ],
        };
    }
    return null;
}

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

    const catalogNsj = await catalogNsjResult(ctxProjectId, targetAmount, termMonths, goal.payment_variant);
    if (catalogNsj) {
        return { nsjResult: catalogNsj, apiError: null };
    }

    if (ctxProjectId != null && isSberLifeCalcProject(ctxProjectId)) {
        const resolvedTermMonths = resolveLifeTermMonths(ctxProjectId, goal.term_months ?? termMonths);

        if (Number(ctxProjectId) === IMMERS_TEST_FINAM_PROJECT_ID) {
            const goalWithTerm = { ...goal, term_months: resolvedTermMonths, target_amount: targetAmount };
            return {
                nsjResult: buildSberPodushkaNsjResult(goalWithTerm, context?.client || {}),
                apiError: null,
            };
        }

        const annualPremium = Math.round(targetAmount * SBER_LIFE_TARIFF * 100) / 100;
        const termYears =
            fixedLifeTermYearsForProject(ctxProjectId) ?? Math.ceil(resolvedTermMonths / 12);
        return {
            nsjResult: {
                success: true,
                total_premium: annualPremium,
                term_years: termYears,
                term_months: resolvedTermMonths,
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
    getLifeFirstPaymentAmount,
    premiumFromSurvivalLimit,
};
