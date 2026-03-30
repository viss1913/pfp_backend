const { buildReportSummaryOverviewHtml } = require('../summary/buildSummaryOverviewHtml');
const { buildGoalPageHtml } = require('../goalPages/buildGoalPagesHtml');
const { buildRostechSummaryOverviewHtml } = require('./rostech/buildRostechSummaryOverviewHtml');
const { buildRostechGoalPageHtml, buildRostechGoalPagesHtml } = require('./rostech/buildRostechGoalPageHtml');

function buildSummaryOverviewHtmlByTheme({ themeKey, ...options }) {
    if (themeKey === 'rostech') return buildRostechSummaryOverviewHtml(options);
    return buildReportSummaryOverviewHtml(options);
}

function buildGoalPageHtmlByTheme({ themeKey, ...args }) {
    if (themeKey === 'rostech') return buildRostechGoalPageHtml(args);
    return buildGoalPageHtml(args);
}

function buildGoalPagesHtmlByTheme({ themeKey, ...args }) {
    if (themeKey === 'rostech') return buildRostechGoalPagesHtml(args);
    return [buildGoalPageHtml(args)];
}

module.exports = {
    buildSummaryOverviewHtmlByTheme,
    buildGoalPageHtmlByTheme,
    buildGoalPagesHtmlByTheme,
};

