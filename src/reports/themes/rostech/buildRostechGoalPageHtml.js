const { buildGoalPageHtml } = require('../../goalPages/buildGoalPagesHtml');
const { buildRostechPensionPagesHtml } = require('./buildRostechPensionPagesHtml');

/**
 * Стартовая заглушка рендера Ростеха для страниц целей.
 * Сейчас возвращаем дефолтный дизайн, чтобы не ломать PDF.
 * Дальше сюда подменим layout/HTML/CSS под новый макет Ростеха.
 */
function buildRostechGoalPageHtml(args) {
    if (String(args?.goalType || '').toUpperCase() === 'PENSION') {
        const pages = buildRostechPensionPagesHtml(args || {});
        return pages[0] || '';
    }
    return buildGoalPageHtml(args);
}

function buildRostechGoalPagesHtml(args) {
    if (String(args?.goalType || '').toUpperCase() === 'PENSION') {
        return buildRostechPensionPagesHtml(args || {});
    }
    return [buildGoalPageHtml(args)];
}

module.exports = { buildRostechGoalPageHtml, buildRostechGoalPagesHtml };

