const { buildGoalPageHtml } = require('../../goalPages/buildGoalPagesHtml');
const { buildRostechPensionPagesHtml } = require('./buildRostechPensionPagesHtml');

/**
 * Стартовая заглушка рендера Ростеха для страниц целей.
 * Сейчас возвращаем дефолтный дизайн, чтобы не ломать PDF.
 * Дальше сюда подменим layout/HTML/CSS под новый макет Ростеха.
 */
async function buildRostechGoalPageHtml(args) {
    if (String(args?.goalType || '').toUpperCase() === 'PENSION') {
        const pages = await buildRostechPensionPagesHtml(args || {});
        return pages[0] || '';
    }
    return await buildGoalPageHtml(args);
}

async function buildRostechGoalPagesHtml(args) {
    if (String(args?.goalType || '').toUpperCase() === 'PENSION') {
        return buildRostechPensionPagesHtml(args || {});
    }
    return [await buildGoalPageHtml(args)];
}

module.exports = { buildRostechGoalPageHtml, buildRostechGoalPagesHtml };
