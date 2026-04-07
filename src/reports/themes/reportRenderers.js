const { buildReportSummaryOverviewHtml } = require('../summary/buildSummaryOverviewHtml');
const { buildGoalPageHtml, buildGoalPagesHtml } = require('../goalPages/buildGoalPagesHtml');
const { buildRostechSummaryOverviewHtml } = require('./rostech/buildRostechSummaryOverviewHtml');
const { buildRostechGoalPageHtml, buildRostechGoalPagesHtml } = require('./rostech/buildRostechGoalPageHtml');

async function buildSummaryOverviewHtmlByTheme({ themeKey, ...options }) {
    if (themeKey === 'rostech') return buildRostechSummaryOverviewHtml(options);
    return await buildReportSummaryOverviewHtml(options);
}

async function buildGoalPageHtmlByTheme({ themeKey, ...args }) {
    if (themeKey === 'rostech') return buildRostechGoalPageHtml(args);
    return await buildGoalPageHtml(args);
}

async function buildGoalPagesHtmlByTheme({ themeKey, ...args }) {
    if (themeKey === 'rostech') return buildRostechGoalPagesHtml(args);
    return await buildGoalPagesHtml(args);
}

module.exports = {
    buildSummaryOverviewHtmlByTheme,
    buildGoalPageHtmlByTheme,
    buildGoalPagesHtmlByTheme,
};
