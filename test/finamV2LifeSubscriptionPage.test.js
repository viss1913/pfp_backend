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
const { loadTemplateDocument } = require('../src/reports/finam_v2/finamV2TemplateLoader');
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
    assert.match(out, /0,7 млн\.руб/);
    assert.match(out, /Подушка безопасности/);
    assert.match(out, /6 лет/);
    assert.match(out, /При травмах/);
    assert.match(out, /0,2 млн руб/);
    assert.match(out, /При инвалидности/);
    assert.match(out, /0,7 млн руб/);
    assert.match(out, /При уходе из жизни/);
    assert.match(out, /Преимущества продукта/);
    assert.match(out, /Оформить полис/);
    assert.match(out, new RegExp(escapeRegExp(DEFAULT_SBER_LIFE_OFFER_URL)));
    assert.strictEqual((out.match(/<hr\b[^>]*\bfinam-v2-life-sub__divider\b/gi) || []).length, 4);
    assert.match(out, /#1e6bb8/);
    assert.doesNotMatch(out, /\.finam-v2-life-sub__cta\s*\{[^}]*width:\s*100%/);
    assert.match(out, /max-width:\s*52%/);
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

test('loadTemplateDocument: subscription page has 4 hr dividers and compact CTA', () => {
    const prev = process.env.FINAM_V2_TEMPLATE_CACHE;
    process.env.FINAM_V2_TEMPLATE_CACHE = '0';
    try {
        const html = loadTemplateDocument('page-goal-life-subscription-v2.html');
        assert.strictEqual((html.match(/<hr\b[^>]*\bfinam-v2-life-sub__divider\b/gi) || []).length, 4);
        assert.match(html, /max-width:\s*52%/);
        assert.doesNotMatch(html, /\.finam-v2-life-sub__cta\s*\{[^}]*width:\s*100%/);
    } finally {
        if (prev === undefined) delete process.env.FINAM_V2_TEMPLATE_CACHE;
        else process.env.FINAM_V2_TEMPLATE_CACHE = prev;
    }
});

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
