'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
    patchHasExplicitManualGoalRisk,
    applyManualGoalRiskSanitize,
} = require('../src/utils/goalManualRisk');

test('patchHasExplicitManualGoalRisk: false for empty / no risk keys', () => {
    assert.strictEqual(patchHasExplicitManualGoalRisk(null), false);
    assert.strictEqual(patchHasExplicitManualGoalRisk({}), false);
    assert.strictEqual(patchHasExplicitManualGoalRisk({ target_amount: 1 }), false);
});

test('patchHasExplicitManualGoalRisk: true when risk_profile or extended present', () => {
    assert.strictEqual(patchHasExplicitManualGoalRisk({ risk_profile: 'CONSERVATIVE' }), true);
    assert.strictEqual(patchHasExplicitManualGoalRisk({ risk_profile_extended: 'MODERATELY_CONSERVATIVE' }), true);
});

test('applyManualGoalRiskSanitize: clears details and extended when only risk_profile', () => {
    const goal = {
        risk_profile: 'AGGRESSIVE',
        risk_profile_extended: 'MODERATELY_AGGRESSIVE',
        risk_profile_details: { final_score: 42 },
    };
    applyManualGoalRiskSanitize(goal, { risk_profile: 'CONSERVATIVE' });
    assert.strictEqual(goal.risk_profile, 'AGGRESSIVE');
    assert.strictEqual(goal.risk_profile_details, null);
    assert.strictEqual(goal.risk_profile_extended, null);
});

test('applyManualGoalRiskSanitize: keeps extended when patch includes it', () => {
    const goal = {
        risk_profile: 'BALANCED',
        risk_profile_extended: 'MODERATELY_CONSERVATIVE',
        risk_profile_details: { x: 1 },
    };
    applyManualGoalRiskSanitize(goal, {
        risk_profile: 'BALANCED',
        risk_profile_extended: 'MODERATELY_CONSERVATIVE',
    });
    assert.strictEqual(goal.risk_profile_details, null);
    assert.strictEqual(goal.risk_profile_extended, 'MODERATELY_CONSERVATIVE');
});

test('applyManualGoalRiskSanitize: noop without explicit risk in patch', () => {
    const goal = { risk_profile_details: { a: 1 } };
    applyManualGoalRiskSanitize(goal, { term_months: 12 });
    assert.deepStrictEqual(goal.risk_profile_details, { a: 1 });
});
