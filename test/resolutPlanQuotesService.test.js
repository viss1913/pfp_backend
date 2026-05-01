'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { parseGoalsSummary } = require('../src/services/resolutPlanQuotesService');

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
