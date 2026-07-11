/**
 * Finam Report v2 — шаблон LIFE: подписка только для Immers test Finam (projectId 2).
 */

const { IMMERS_TEST_FINAM_PROJECT_ID } = require('../../algorithms/calculators/lifeTermDefaults');

const LIFE_SUBSCRIPTION_TEMPLATE = 'page-goal-life-subscription-v2.html';
const LIFE_DEFAULT_TEMPLATE = 'page-goal-life-v2.html';

function isLifeSubscriptionLifePage(projectId) {
    return Number(projectId) === IMMERS_TEST_FINAM_PROJECT_ID;
}

/**
 * @param {unknown} projectId
 * @returns {string}
 */
function resolveLifeGoalTemplateFileName(projectId) {
    return isLifeSubscriptionLifePage(projectId) ? LIFE_SUBSCRIPTION_TEMPLATE : LIFE_DEFAULT_TEMPLATE;
}

/** Тот же критерий, что и выбор HTML-файла — applier не должен расходиться с шаблоном. */
function usesLifeSubscriptionTemplate(projectId) {
    return resolveLifeGoalTemplateFileName(projectId) === LIFE_SUBSCRIPTION_TEMPLATE;
}

module.exports = {
    IMMERS_TEST_FINAM_PROJECT_ID,
    LIFE_SUBSCRIPTION_TEMPLATE,
    LIFE_DEFAULT_TEMPLATE,
    isLifeSubscriptionLifePage,
    usesLifeSubscriptionTemplate,
    resolveLifeGoalTemplateFileName,
};
