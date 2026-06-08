'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const {
    resolveLifeGoalTemplateFileName,
    LIFE_SUBSCRIPTION_TEMPLATE,
    LIFE_DEFAULT_TEMPLATE,
    IMMERS_TEST_FINAM_PROJECT_ID,
} = require('../src/reports/finam_v2/finamV2LifePageConfig');
const {
    applyTemplateData,
    pickLifeRiskAmount,
    replaceLifeSubscriptionGoalPage,
} = require('../src/reports/finam_v2/finamV2TemplateAppliers');
const { FINAM_REPORT_V2_PAGE_TYPES } = require('../src/reports/finam_v2/finamReportV2Contract');
const { DEFAULT_SBER_LIFE_OFFER_URL } = require('../src/utils/atbBankBranding');

const TEMPLATE_PATH = path.join(
    __dirname,
    '..',
    'src',
    'reports',
    'finam_v2',
    'page-goal-life-subscription-v2.html'
);

const ACTUARIAL_LIFE_GOAL = {
    goal_type: 'LIFE',
    goal_name: 'Защита жизни',
    summary: {
        target_months: 72,
        target_coverage: 650455,
        annual_premium: 14700,
        monthly_replenishment: 1325,
    },
    details: {
        program_name: 'Подушка безопасности · Сбер Страхование Жизни',
        annual_premium: 14700,
        monthly_premium: 1325,
        risks: [
            { risk_name: 'Уход из жизни', limit_amount: 650455 },
            { risk_name: 'Инвалидность I-II гр.', limit_amount: 650455 },
            { risk_name: 'Травмы', limit_amount: 195135 },
        ],
    },
};

const helpers = {
    formatMoney(value, opts) {
        const n = Number(value);
        const abs = Math.abs(n);
        if (opts?.short && abs >= 1000000) {
            return `${(n / 1000000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млн ₽`;
        }
        return `${Math.round(n).toLocaleString('ru-RU')} ₽`;
    },
};

function loadSubscriptionTemplate() {
    return fs.readFileSync(TEMPLATE_PATH, 'utf8');
}

test('resolveLifeGoalTemplateFileName: projectId=2 -> subscription template', () => {
    assert.strictEqual(resolveLifeGoalTemplateFileName(IMMERS_TEST_FINAM_PROJECT_ID), LIFE_SUBSCRIPTION_TEMPLATE);
});

test('resolveLifeGoalTemplateFileName: projectId=14 -> default LIFE template', () => {
    assert.strictEqual(resolveLifeGoalTemplateFileName(14), LIFE_DEFAULT_TEMPLATE);
});

test('pickLifeRiskAmount finds trauma limit from risks', () => {
    const risks = ACTUARIAL_LIFE_GOAL.details.risks.map((r) => ({
        name: r.risk_name,
        amount: r.limit_amount,
    }));
    assert.strictEqual(pickLifeRiskAmount(risks, ['травм'], 1), 195135);
    assert.strictEqual(pickLifeRiskAmount(risks, ['инвалид'], 1), 650455);
    assert.strictEqual(pickLifeRiskAmount(risks, ['уход'], 1), 650455);
});

test('replaceLifeSubscriptionGoalPage substitutes actuarial premiums and limits', () => {
    const html = loadSubscriptionTemplate();
    const out = replaceLifeSubscriptionGoalPage(html, {
        goal: ACTUARIAL_LIFE_GOAL,
        helpers,
        model: { meta: { projectId: IMMERS_TEST_FINAM_PROJECT_ID } },
    });

    assert.match(out, /14(?:&nbsp;|\s)700 рублей в год/);
    assert.match(out, /0,7 млн руб/);
    assert.match(out, /Подушка безопасности/);
    assert.match(out, /6 лет/);
    assert.match(out, /195(?:&nbsp;|\s)135/);
    assert.match(out, /650(?:&nbsp;|\s)455/);
    assert.match(out, /Оформить полис/);
    assert.match(out, new RegExp(escapeRegExp(DEFAULT_SBER_LIFE_OFFER_URL)));
});

test('applyTemplateData routes projectId=2 LIFE to subscription applier', () => {
    const html = loadSubscriptionTemplate();
    const out = applyTemplateData(html, {
        pageType: FINAM_REPORT_V2_PAGE_TYPES.GOAL_LIFE,
        goal: ACTUARIAL_LIFE_GOAL,
        helpers,
        model: { meta: { projectId: IMMERS_TEST_FINAM_PROJECT_ID } },
    });
    assert.match(out, /finam-v2-life-sub__hero-title/);
    assert.match(out, /14(?:&nbsp;|\s)700 рублей в год/);
    assert.doesNotMatch(out, /finam-v2-life__risk-grid/);
});

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
