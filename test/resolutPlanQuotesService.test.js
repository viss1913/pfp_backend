'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { parseGoalsSummary, applyResolutPlanTermFloor } = require('../src/services/resolutPlanQuotesService');

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
