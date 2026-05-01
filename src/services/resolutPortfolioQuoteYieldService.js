'use strict';

const resolutService = require('./resolutService');

function resolveResolutProjectId() {
    const n = Number(process.env.RESOLUT_PROJECT_ID || 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Строгий gate: только целевой проект AV/Resolut и непустой resolut_pfp_code у продукта.
 */
function isResolutPortfolioProduct(product, projectId) {
    const pid = Number(projectId);
    const allowed = resolveResolutProjectId();
    if (!allowed || pid !== allowed) return false;
    const code = product && product.resolut_pfp_code;
    return typeof code === 'string' && code.trim().length > 0;
}

function pickPType(product) {
    if (product.resolut_quote_p_type != null && product.resolut_quote_p_type !== '') {
        const p = parseInt(String(product.resolut_quote_p_type), 10);
        if (Number.isFinite(p)) return p;
    }
    const env = Number(process.env.RESOLUT_PORTFOLIO_QUOTE_PTYPE);
    if (Number.isFinite(env)) return env;
    return 0;
}

/**
 * FV по дожитию из risks[] (котировка НСЖ/накоп); иначе верхний data.limit.
 */
function pickSurvivalFv(data) {
    if (!data || typeof data !== 'object') return null;
    const risks = Array.isArray(data.risks) ? data.risks : [];
    const survival = risks.find((x) => {
        const code = (x && x.code) ? String(x.code) : '';
        const name = (x && x.name) ? String(x.name) : '';
        return /survival/i.test(code) || /дожит/i.test(name);
    });
    if (survival != null && Number(survival.limit) > 0) {
        return Number(survival.limit);
    }
    if (Number(data.limit) > 0) return Number(data.limit);
    return null;
}

/**
 * Эквивалентная простая годовая в % для одного взноса PV и выплаты FV через termMonths.
 */
function impliedAnnualPercentFromLumpSum({ pv, fv, termMonths }) {
    const n = Number(termMonths) / 12;
    if (!Number.isFinite(n) || n <= 0) return null;
    if (!(pv > 0) || !(fv > 0)) return null;
    return (Math.pow(fv / pv, 1 / n) - 1) * 100;
}

/**
 * Годовая доходность в процентах (как в lines.yield_percent) из котировки Resolut.
 * Поддержан только pType=0 (единовременный взнос): иначе null → калькулятор возьмёт матрицу lines.
 *
 * @returns {Promise<number|null>}
 */
async function getImpliedAnnualYieldPercentFromQuote({
    product,
    termMonths,
    allocatedAmount,
    projectId,
    userId,
    client
}) {
    if (!isResolutPortfolioProduct(product, projectId)) return null;

    const pType = pickPType(product);
    if (pType !== 0) {
        console.warn('[ResolutPortfolioQuoteYield] implied yield only for pType=0; product id=%s pType=%s', product.id, pType);
        return null;
    }

    const termYears = Math.max(1, Math.floor(Number(termMonths || 12) / 12));
    const limit = parseFloat(Number(allocatedAmount).toFixed(2));
    if (!Number.isFinite(limit) || limit <= 0) return null;

    const { buildNszhLikeParameters } = require('./resolutQuoteLineSuggestService');
    let body;
    try {
        body = buildNszhLikeParameters({
            projectId,
            product,
            clientRow: client || {},
            termMonths,
            amount: limit,
            valuationType: 'byLimit'
        });
    } catch (e) {
        console.warn('[ResolutPortfolioQuoteYield] build parameters failed:', e && (e.message || e.error) ? String(e.message || e.error) : String(e));
        return null;
    }

    let norm;
    try {
        norm = await resolutService.quote(projectId, body, { userId: userId != null ? Number(userId) : null });
    } catch (e) {
        const msg = e && (e.message || e.error) ? String(e.message || e.error) : String(e);
        console.warn('[ResolutPortfolioQuoteYield] quote exception:', msg);
        return null;
    }

    if (!norm.ok || norm.err) {
        console.warn('[ResolutPortfolioQuoteYield] quote failed:', norm.err || norm);
        return null;
    }

    const d = norm.data || {};
    const premium = d.premiumFull != null ? d.premiumFull : d.premium;
    const pv = Number(premium);
    if (!Number.isFinite(pv) || pv <= 0) return null;

    const fv = pickSurvivalFv(d);
    if (fv == null || !(fv > 0)) return null;

    const ann = impliedAnnualPercentFromLumpSum({
        pv,
        fv,
        termMonths: Number(termMonths) || termYears * 12
    });
    return Number.isFinite(ann) ? ann : null;
}

module.exports = {
    getImpliedAnnualYieldPercentFromQuote,
    isResolutPortfolioProduct,
    pickPType,
    pickSurvivalFv,
    impliedAnnualPercentFromLumpSum,
    resolveResolutProjectId
};
