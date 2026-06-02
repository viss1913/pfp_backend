'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
    parseGoalsSummary,
    applyResolutPlanTermFloor,
    buildQuoteLinesForMergedRows
} = require('../src/services/resolutPlanQuotesService');
const productRepository = require('../src/repositories/productRepository');

test('parseGoalsSummary: flat snapshot', () => {
    const p = parseGoalsSummary(JSON.stringify({
        summary: { consolidated_portfolio: {} },
        goals: [{ goal_id: 1 }]
    }));
    assert.ok(p.summary);
    assert.strictEqual(p.goals.length, 1);
});

test('parseGoalsSummary: wrapped in calculation', () => {
    const p = parseGoalsSummary({
        calculation: {
            summary: { x: 1 },
            goals: []
        }
    });
    assert.strictEqual(p.summary.x, 1);
});

test('parseGoalsSummary: invalid json string', () => {
    assert.strictEqual(parseGoalsSummary('{'), null);
});

test('applyResolutPlanTermFloor: default floor 60 months when env unset', () => {
    const prev = process.env.RESOLUT_PLAN_MIN_TERM_MONTHS;
    delete process.env.RESOLUT_PLAN_MIN_TERM_MONTHS;
    try {
        const r = applyResolutPlanTermFloor(24);
        assert.strictEqual(r.term_months_used, 60);
        assert.strictEqual(r.term_months_requested, 24);
        assert.strictEqual(r.term_months_clamped, true);
        assert.strictEqual(r.resolut_plan_min_term_months, 60);
    } finally {
        if (prev === undefined) delete process.env.RESOLUT_PLAN_MIN_TERM_MONTHS;
        else process.env.RESOLUT_PLAN_MIN_TERM_MONTHS = prev;
    }
});

test('applyResolutPlanTermFloor: RESOLUT_PLAN_MIN_TERM_MONTHS=0 disables clamp', () => {
    const prev = process.env.RESOLUT_PLAN_MIN_TERM_MONTHS;
    process.env.RESOLUT_PLAN_MIN_TERM_MONTHS = '0';
    try {
        const r = applyResolutPlanTermFloor(24);
        assert.strictEqual(r.term_months_used, 24);
        assert.strictEqual(r.term_months_clamped, false);
        assert.strictEqual(r.resolut_plan_min_term_months, null);
    } finally {
        if (prev === undefined) delete process.env.RESOLUT_PLAN_MIN_TERM_MONTHS;
        else process.env.RESOLUT_PLAN_MIN_TERM_MONTHS = prev;
    }
});

test('buildQuoteLinesForMergedRows: DEPOSIT/PDS are skipped as manual-only', async () => {
    const prevProjectId = process.env.RESOLUT_PROJECT_ID;
    const prevFindById = productRepository.findById;
    process.env.RESOLUT_PROJECT_ID = '23';
    productRepository.findById = async () => ({
        id: 17,
        name: 'Депозит Альфа 1',
        product_type: 'DEPOSIT',
        resolut_pfp_code: 'depAlfa'
    });
    try {
        const built = await buildQuoteLinesForMergedRows({
            projectId: 23,
            client: { birth_date: '1990-01-01', gender: 'male' },
            mergedRows: [{ product_id: 17, resolut_pfp_code: 'depAlfa', amount: 2000000, names: ['Депозит Альфа 1'] }],
            termMonths: 12,
            valuationType: 'byLimit',
            pTypeOverride: null,
            lineIdPrefix: 'plan_asset'
        });
        assert.deepStrictEqual(built.quotes, []);
        assert.strictEqual(built.skipped.length, 1);
        assert.strictEqual(built.skipped[0].reason, 'deposit_like_manual_only');
    } finally {
        if (prevProjectId === undefined) delete process.env.RESOLUT_PROJECT_ID;
        else process.env.RESOLUT_PROJECT_ID = prevProjectId;
        productRepository.findById = prevFindById;
    }
});
