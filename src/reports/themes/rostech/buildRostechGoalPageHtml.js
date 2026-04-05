const { buildGoalPageHtml } = require('../../goalPages/buildGoalPagesHtml');
const { buildRostechPensionPagesHtml } = require('./buildRostechPensionPagesHtml');
const { buildRostechInvestmentPagesHtml } = require('./buildRostechInvestmentPagesHtml');
const { buildRostechOtherPagesHtml } = require('./buildRostechOtherPagesHtml');

/**
 * Стартовая заглушка рендера Ростеха для страниц целей.
 * Сейчас возвращаем дефолтный дизайн, чтобы не ломать PDF.
 * Дальше сюда подменим layout/HTML/CSS под новый макет Ростеха.
 */
async function buildRostechGoalPageHtml(args) {
    const gt = String(args?.goalType || '').toUpperCase();
    if (gt === 'PENSION') {
        const pages = await buildRostechPensionPagesHtml(args || {});
        return pages[0] || '';
    }
    if (gt === 'INVESTMENT') {
        const pages = await buildRostechInvestmentPagesHtml(args || {});
        return pages[0] || '';
    }
    if (gt === 'OTHER') {
        const pages = await buildRostechOtherPagesHtml(args || {});
        return pages[0] || '';
    }
    return await buildGoalPageHtml(args);
}

async function buildRostechGoalPagesHtml(args) {
    const gt = String(args?.goalType || '').toUpperCase();
    if (gt === 'PENSION') {
        return buildRostechPensionPagesHtml(args || {});
    }
    if (gt === 'INVESTMENT') {
        return buildRostechInvestmentPagesHtml(args || {});
    }
    if (gt === 'OTHER') {
        return buildRostechOtherPagesHtml(args || {});
    }
    return [await buildGoalPageHtml(args)];
}

module.exports = { buildRostechGoalPageHtml, buildRostechGoalPagesHtml };
