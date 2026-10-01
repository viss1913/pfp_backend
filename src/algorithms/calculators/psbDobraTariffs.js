/**
 * «Добра наживешь» (группа telem): тариф дожития — доля страховой суммы.
 * От возраста и пола не зависит. Срок договора 5–25 лет.
 * Источник: PSBLife-lifeAccumulate-products.json, risk=endowment, group=telem.
 */

const PSB_DOBRA_DEFAULT_YEARS = 20;

/** Раз в год */
const ANNUAL_TARIFF_BY_YEAR = Object.freeze({
    5: 0.1818181818,
    6: 0.1501502,
    7: 0.127551,
    8: 0.1106195,
    9: 0.0974659,
    10: 0.0869565,
    11: 0.0787092,
    12: 0.0718391,
    13: 0.0660284,
    14: 0.0610501,
    15: 0.0567376,
    16: 0.0529661,
    17: 0.0496401,
    18: 0.0466853,
    19: 0.0440432,
    20: 0.0416667,
    21: 0.0393546,
    22: 0.0372578,
    23: 0.0353482,
    24: 0.0336022,
    25: 0.032,
});

/** Единовременно */
const SINGLE_TARIFF_BY_YEAR = Object.freeze({
    5: 0.78125,
    6: 0.7692308,
    7: 0.7575758,
    8: 0.7462687,
    9: 0.729927,
    10: 0.7142857,
    11: 0.7092199,
    12: 0.7042254,
    13: 0.6993007,
    14: 0.6944444,
    15: 0.6896552,
    16: 0.6849315,
    17: 0.6802721,
    18: 0.6756757,
    19: 0.6711409,
    20: 0.6666667,
    21: 0.6535948,
    22: 0.6410256,
    23: 0.6289308,
    24: 0.617284,
    25: 0.6060606,
});

function dobraPaymentMode(goal) {
    const variant = goal?.payment_variant;
    if (variant === 0 || variant === '0' || variant === 'once' || variant === 'single') return 'single';
    return 'annual';
}

/**
 * Срок в годах. Пустой срок — 20 лет. Вне 5–25 прижимается к границе таблицы.
 * @param {number|string|null|undefined} termMonths
 * @returns {number}
 */
function resolveDobraTermYears(termMonths) {
    const months = Number(termMonths);
    if (!Number.isFinite(months) || months <= 0) return PSB_DOBRA_DEFAULT_YEARS;
    let years = Math.round(months / 12);
    if (years < 5) years = 5;
    if (years > 25) years = 25;
    return years;
}

/**
 * @param {number} sumInsured
 * @param {number|string|null|undefined} termMonths
 * @param {'annual'|'single'} payment
 */
function dobraPremium(sumInsured, termMonths, payment) {
    const years = resolveDobraTermYears(termMonths);
    const mode = payment === 'single' ? 'single' : 'annual';
    const tariff = (mode === 'single' ? SINGLE_TARIFF_BY_YEAR : ANNUAL_TARIFF_BY_YEAR)[years];
    const sum = Number(sumInsured);
    const premium = Number.isFinite(sum) && sum > 0
        ? Math.round(sum * tariff)
        : 0;
    return {
        years,
        termMonths: years * 12,
        payment: mode,
        tariff,
        premium,
    };
}

function buildDobraNsjResult(goal) {
    const payment = dobraPaymentMode(goal);
    const quote = dobraPremium(goal?.target_amount, goal?.term_months, payment);
    const sum = Math.round(Number(goal?.target_amount || 0));
    return {
        success: true,
        psb_dobra: true,
        program: 'Добра наживешь',
        company_name: 'ПСБ Жизнь',
        total_premium: quote.premium,
        term_years: quote.years,
        term_months: quote.termMonths,
        total_limit: sum,
        tariff: quote.tariff,
        payment_frequency: quote.payment === 'single' ? 'once' : 'annual',
        risks: [
            { risk_name: 'Дожитие', limit_amount: sum },
            { risk_name: 'Смерть ЛП' },
            { risk_name: 'Смерть НС' },
            { risk_name: 'Смерть ДТП' },
            { risk_name: 'Телемедицина' },
            { risk_name: 'Инвалидность ОУСВ' },
        ],
    };
}

module.exports = {
    PSB_DOBRA_DEFAULT_YEARS,
    ANNUAL_TARIFF_BY_YEAR,
    SINGLE_TARIFF_BY_YEAR,
    dobraPaymentMode,
    resolveDobraTermYears,
    dobraPremium,
    buildDobraNsjResult,
};
