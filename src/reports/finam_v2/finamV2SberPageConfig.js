/**
 * Finam Report v2 — хвост PDF для тенанта SBER (projectId 29).
 * Finam-only листы (Comon, ДУ Finam, спецпредложения) заменяются витринами Сбера.
 */

const { FINAM_REPORT_V2_PAGE_TYPES } = require('./finamReportV2Contract');
const { FINAM_V2_TAIL_PAGE_ORDER } = require('./finamV2PageManifest');

const SBER_PROJECT_ID = 29;

const SBER_V2_TAIL_PAGE_ORDER = Object.freeze([
    FINAM_REPORT_V2_PAGE_TYPES.PORTFOLIO_SUMMARY,
    FINAM_REPORT_V2_PAGE_TYPES.TAX_PLANNING,
    FINAM_REPORT_V2_PAGE_TYPES.SBER_EQUITIES_SHOWCASE,
    FINAM_REPORT_V2_PAGE_TYPES.SBER_BONDS_SHOWCASE,
    FINAM_REPORT_V2_PAGE_TYPES.ROADMAP,
    FINAM_REPORT_V2_PAGE_TYPES.INFLATION,
    FINAM_REPORT_V2_PAGE_TYPES.RISK_DECLARATION,
    FINAM_REPORT_V2_PAGE_TYPES.DETAILED_PLAN,
]);

function isSberProject(projectId) {
    const n = Number(projectId);
    return Number.isFinite(n) && n === SBER_PROJECT_ID;
}

/**
 * @param {unknown} projectId
 * @returns {readonly string[]}
 */
function resolveTailPageOrder(projectId) {
    return isSberProject(projectId) ? SBER_V2_TAIL_PAGE_ORDER : FINAM_V2_TAIL_PAGE_ORDER;
}

module.exports = {
    SBER_PROJECT_ID,
    SBER_V2_TAIL_PAGE_ORDER,
    isSberProject,
    resolveTailPageOrder,
};
