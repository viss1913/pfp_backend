/**
 * White-label Finam Report v2 для АТБ tenant-ов (legacy 28 + новый 3).
 * Реальная логика вынесена в общий util, чтобы один и тот же branding
 * использовался в отчёте, письмах и project-scoped хуках.
 */

const {
    DEFAULT_ATB_BANK_PROJECT_IDS,
    ATB_LIFE_PROGRAM_LABEL,
    ATB_LIFE_PROVIDER_LABEL,
    isAtbBankProject,
    applyAtbLifeGoalDisplay,
    atbBrandingRiskDeclarationHtml,
    applyAtbReportBranding,
    resolveAtbLifeOfferUrl,
} = require('../../utils/atbBankBranding');

module.exports = {
    ATB_BANK_PROJECT_IDS: DEFAULT_ATB_BANK_PROJECT_IDS,
    ATB_LIFE_PROGRAM_LABEL,
    ATB_LIFE_PROVIDER_LABEL,
    isAtbBankProject,
    applyAtbLifeGoalDisplay,
    atbBrandingRiskDeclarationHtml,
    applyAtbReportBranding,
    resolveAtbLifeOfferUrl,
};
