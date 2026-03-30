const { buildReportSummaryOverviewHtml } = require('../../summary/buildSummaryOverviewHtml');

/**
 * Стартовая заглушка рендера Ростеха.
 * Сейчас возвращаем дефолтный дизайн, чтобы не ломать PDF.
 * Дальше сюда подменим HTML/CSS под новый макет Ростеха.
 */
function buildRostechSummaryOverviewHtml(options = {}) {
    return buildReportSummaryOverviewHtml(options);
}

module.exports = { buildRostechSummaryOverviewHtml };

