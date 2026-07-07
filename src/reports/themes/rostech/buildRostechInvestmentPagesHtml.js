const { isRostechReportV2Project } = require('../themeResolver');
const { computeInvestmentEndContext } = require('./rostechPdfUtils');

/**
 * Ростех PDF: цель INVESTMENT (Сохранить и приумножить).
 */
async function buildRostechInvestmentPagesHtml(args) {
    if (isRostechReportV2Project(args?.options?.projectId)) {
        return require('./v2/rostechV2Composer').buildRostechV2InvestmentPagesHtml(args);
    }
    const { buildRostechInvestmentPagesHtmlLegacy } = require('./buildRostechInvestmentPagesHtmlLegacy');
    return buildRostechInvestmentPagesHtmlLegacy(args);
}

module.exports = { buildRostechInvestmentPagesHtml, computeInvestmentEndContext };
