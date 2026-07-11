'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { applyTemplateData } = require('../src/reports/finam_v2/finamV2TemplateAppliers');
const { FINAM_REPORT_V2_PAGE_TYPES } = require('../src/reports/finam_v2/finamReportV2Contract');

const TEMPLATE_PATH = path.join(__dirname, '..', 'src/reports/finam_v2/page-goal-save-grow-v2.html');

const INVESTMENT_GOAL = {
    name: 'Сохранить и преумножить',
    goal_type_id: 3,
    initial_capital: 3400000,
    summary: {
        initial_capital: 1446516,
        monthly_replenishment: 25000,
        target_months: 84,
        projected_capital_at_end: 9841366.25,
        accumulation_yield_percent: 19.6,
    },
    risk_profile: 'AGGRESSIVE',
};

const helpers = {
    formatMoney(value, opts) {
        const n = Number(value);
        if (opts?.short && Math.abs(n) >= 1000000) {
            return `${(n / 1000000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млн ₽`;
        }
        return `${Math.round(n).toLocaleString('ru-RU')} ₽`;
    },
};

test('GOAL_SAVE_GROW uses goal metrics, not plan total_capital', () => {
    const html = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    const out = applyTemplateData(html, {
        pageType: FINAM_REPORT_V2_PAGE_TYPES.GOAL_SAVE_GROW,
        goal: INVESTMENT_GOAL,
        helpers,
        model: { portfolio: { projectedTotal: 74912719, initialTotal: 3400000, monthlyTotal: 37052 } },
    });

    assert.match(out, /9,8 млн/);
    assert.match(out, /1,4 млн/);
    assert.match(out, /25(?:&nbsp;|\s)000/);
    assert.match(out, /19,6%/);
    assert.doesNotMatch(out, /74,9 млн/);
    assert.doesNotMatch(out, /50&nbsp;000 ₽/);
});
