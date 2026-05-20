'use strict';

/**
 * @param {string|Date|null|undefined} birthDate
 * @param {Date} [asOf]
 * @returns {number|null}
 */
function clientAgeYears(birthDate, asOf = new Date()) {
    if (birthDate == null || birthDate === '') return null;
    const b = new Date(birthDate);
    if (Number.isNaN(b.getTime())) return null;
    const ref = asOf instanceof Date && !Number.isNaN(asOf.getTime()) ? asOf : new Date();
    let age = ref.getFullYear() - b.getFullYear();
    const m = ref.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && ref.getDate() < b.getDate())) age -= 1;
    return Number.isFinite(age) ? age : null;
}

function isSurvivalRiskName(name) {
    const s = String(name || '').trim();
    return /дожит/i.test(s) || /survival/i.test(s);
}

function inTermRange(line, termMonths) {
    const t = Number(termMonths);
    const from = Number(line.term_from_months);
    const to = Number(line.term_to_months);
    if (!Number.isFinite(t)) return false;
    if (Number.isFinite(from) && t < from) return false;
    if (Number.isFinite(to) && to > 0 && t > to) return false;
    return true;
}

function inAmountRange(line, amount) {
    const a = Number(amount);
    const from = parseFloat(line.amount_from);
    const to = parseFloat(line.amount_to);
    if (!Number.isFinite(a) || a < 0) return false;
    if (Number.isFinite(from) && a < from) return false;
    if (Number.isFinite(to) && to > 0 && a > to) return false;
    return true;
}

/**
 * Если возраст клиента неизвестен — строки с age_from/to не отфильтровываем (как в плане: match без age).
 */
function inAgeRange(line, ageYears) {
    if (ageYears == null || !Number.isFinite(Number(ageYears))) return true;
    const a = Number(ageYears);
    const from = line.age_from != null && line.age_from !== '' ? Number(line.age_from) : null;
    const to = line.age_to != null && line.age_to !== '' ? Number(line.age_to) : null;
    if (from != null && Number.isFinite(from) && a < from) return false;
    if (to != null && Number.isFinite(to) && a > to) return false;
    return true;
}

function rowMatches(line, termMonths, ageYears, allocatedAmount) {
    return inTermRange(line, termMonths)
        && inAmountRange(line, allocatedAmount)
        && inAgeRange(line, ageYears);
}

function specificityScore(line) {
    const tw = Math.max(0, Number(line.term_to_months) - Number(line.term_from_months));
    const aw = Math.max(0, parseFloat(line.amount_to) - parseFloat(line.amount_from));
    const agw = (() => {
        const af = line.age_from != null && line.age_from !== '' ? Number(line.age_from) : null;
        const at = line.age_to != null && line.age_to !== '' ? Number(line.age_to) : null;
        if (af == null || at == null || !Number.isFinite(af) || !Number.isFinite(at)) return Infinity;
        return Math.max(0, at - af);
    })();
    const tPart = Number.isFinite(tw) && tw >= 0 ? 1 / (1 + tw) : 0;
    const aPart = Number.isFinite(aw) && aw >= 0 ? 1 / (1 + aw / 1e6) : 0;
    const gPart = Number.isFinite(agw) && agw > 0 && agw !== Infinity ? 1 / (1 + agw) : 0;
    return tPart + aPart + gPart;
}

/**
 * Все строки матрицы ISZH, попадающие в контекст (для UI / отчёта).
 * @param {Array<Object>} yields
 * @param {number} termMonths
 * @param {number|null} ageYears
 * @param {number} allocatedAmount
 * @returns {Array<Object>}
 */
function filterRowsByGoalContext(yields, termMonths, ageYears, allocatedAmount) {
    const list = Array.isArray(yields) ? yields : [];
    return list.filter((line) => rowMatches(line, termMonths, ageYears, allocatedAmount));
}

/**
 * Лучшая строка «Дожитие» для доходности.
 * @param {Array<Object>} yields
 * @param {number} termMonths
 * @param {number|null} ageYears
 * @param {number} allocatedAmount
 * @returns {Object|null}
 */
function pickBestSurvivalLine(yields, termMonths, ageYears, allocatedAmount) {
    const candidates = filterRowsByGoalContext(yields, termMonths, ageYears, allocatedAmount)
        .filter((line) => isSurvivalRiskName(line.risk_name));
    if (!candidates.length) return null;
    candidates.sort((a, b) => specificityScore(b) - specificityScore(a));
    return candidates[0];
}

/**
 * @returns {number}
 */
function survivalYieldPercentOrThrow(survivalLine, productLabel) {
    const y = survivalLine && survivalLine.yield_percent;
    const n = Number(y);
    if (!Number.isFinite(n)) {
        throw new Error(
            `ISZH «${productLabel}»: в строке риска «Дожитие» задана некорректная доходность (yield_percent).`
        );
    }
    return n;
}

/**
 * Доходность только из матрицы «Дожитие» (без котировок Resolut).
 * @param {Object} product
 * @param {Object} goal
 * @param {number} allocatedAmount
 * @param {Object|null} context
 * @returns {{ productYield: number, shortTermYield: number }}
 */
function resolveIszhSurvivalYieldsFromMatrix(product, goal, allocatedAmount, context) {
    const yields = product.yields || [];
    const termMonths = Number(goal.term_months || 0);
    const ageYears = clientAgeYears(
        context && context.client ? context.client.birth_date : null,
        goal.start_date ? new Date(goal.start_date) : new Date()
    );
    const survival = pickBestSurvivalLine(yields, termMonths, ageYears, allocatedAmount);
    if (!survival) {
        const label = product.name || `product #${product.id}`;
        throw new Error(
            `ISZH «${label}»: нет строки матрицы «Дожитие» для срока ${termMonths} мес., суммы ~${Math.round(allocatedAmount)} и возраста ${ageYears == null ? '—' : ageYears}.`
        );
    }
    const productYield = survivalYieldPercentOrThrow(survival, product.name || String(product.id));
    return { productYield, shortTermYield: productYield };
}

/**
 * Плоский список рисков для фронта / отчёта (все строки матрицы, попавшие в контекст).
 * @param {Object} product
 * @param {Object} goal
 * @param {number} allocatedAmount
 * @param {Object|null} context
 * @returns {Array<Object>}
 */
function buildInsuranceRiskRows(product, goal, allocatedAmount, context) {
    const yields = product.yields || [];
    const termMonths = Number(goal.term_months || 0);
    const ageYears = clientAgeYears(
        context && context.client ? context.client.birth_date : null,
        goal.start_date ? new Date(goal.start_date) : new Date()
    );
    const rows = filterRowsByGoalContext(yields, termMonths, ageYears, allocatedAmount);
    const pid = product.id != null ? Number(product.id) : null;
    const pname = product.name || '';
    return rows.map((line) => ({
        product_id: pid,
        product_name: pname,
        risk_name: line.risk_name != null ? String(line.risk_name) : '',
        term_from_months: Number(line.term_from_months),
        term_to_months: Number(line.term_to_months),
        age_from: line.age_from != null && line.age_from !== '' ? Number(line.age_from) : null,
        age_to: line.age_to != null && line.age_to !== '' ? Number(line.age_to) : null,
        amount_from: parseFloat(line.amount_from),
        amount_to: parseFloat(line.amount_to),
        payment_ratio: line.payment_ratio != null && line.payment_ratio !== ''
            ? Number(line.payment_ratio)
            : null,
        yield_percent: line.yield_percent != null && line.yield_percent !== ''
            ? Number(line.yield_percent)
            : null
    }));
}

module.exports = {
    clientAgeYears,
    isSurvivalRiskName,
    rowMatches,
    filterRowsByGoalContext,
    pickBestSurvivalLine,
    resolveIszhSurvivalYieldsFromMatrix,
    buildInsuranceRiskRows
};
