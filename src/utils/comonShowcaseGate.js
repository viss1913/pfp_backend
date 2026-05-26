/**
 * Условия показа витрины Comon в отчёте (Finam): наличие STOCK в сводном портфеле.
 */

const DEFAULT_GATE_PRODUCT_TYPES = ['STOCK'];

function normalizeProductTypes(raw) {
    if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_GATE_PRODUCT_TYPES;
    const out = raw
        .map((t) => String(t || '').toUpperCase().trim())
        .filter(Boolean);
    return out.length > 0 ? out : DEFAULT_GATE_PRODUCT_TYPES;
}

/**
 * @param {object|null|undefined} summary — calc summary с consolidated_portfolio
 * @param {string[]} [requiredTypes] — например ['STOCK']
 */
function planHasProductTypes(summary, requiredTypes = DEFAULT_GATE_PRODUCT_TYPES) {
    const need = new Set(normalizeProductTypes(requiredTypes));
    const consolidated =
        summary && typeof summary.consolidated_portfolio === 'object'
            ? summary.consolidated_portfolio
            : {};
    const rows = [
        ...(Array.isArray(consolidated.assets_allocation) ? consolidated.assets_allocation : []),
        ...(Array.isArray(consolidated.cash_flow_allocation) ? consolidated.cash_flow_allocation : []),
    ];
    for (const row of rows) {
        const pt = String(row?.product_type || '').toUpperCase().trim();
        if (pt && need.has(pt)) return true;
    }
    return false;
}

function planHasStockInPlan(summary) {
    return planHasProductTypes(summary, DEFAULT_GATE_PRODUCT_TYPES);
}

/**
 * Витрину печатаем в PDF только при непустом items и без skip_reason.
 * @param {object|null|undefined} showcase
 */
function shouldIncludeComonShowcaseInReport(showcase) {
    if (!showcase || typeof showcase !== 'object') return false;
    if (showcase.enabled === false) return false;
    if (showcase.skip_reason) return false;
    if (showcase.error) return false;
    const items = Array.isArray(showcase.items) ? showcase.items : [];
    return items.length > 0;
}

module.exports = {
    DEFAULT_GATE_PRODUCT_TYPES,
    normalizeProductTypes,
    planHasProductTypes,
    planHasStockInPlan,
    shouldIncludeComonShowcaseInReport,
};
