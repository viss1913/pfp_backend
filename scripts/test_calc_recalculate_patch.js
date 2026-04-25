/* eslint-disable no-console */
const assert = require('assert');
const { normalizeRecalculatePatch } = require('../src/services/calcRecalculateFlowService');

function run() {
    const monthlyPatch = normalizeRecalculatePatch({
        target_goal: { id: '123', goal_type_id: '1', name: 'Пенсия' },
        goal_patch: { monthly_replenishment: '35000', term_months: '180' },
        client_patch: {},
        needs_clarification: false,
    });
    assert.strictEqual(monthlyPatch.target_goal.id, 123);
    assert.strictEqual(monthlyPatch.target_goal.goal_type_id, 1);
    assert.strictEqual(monthlyPatch.goal_patch.monthly_replenishment, 35000);
    assert.strictEqual(monthlyPatch.goal_patch.term_months, 180);

    const clarifyPatch = normalizeRecalculatePatch({
        target_goal: { goal_type_id: '4', name: 'Квартира' },
        goal_patch: {},
        client_patch: {},
        needs_clarification: true,
        clarification_question: 'Уточните сумму ежемесячного пополнения',
    });
    assert.strictEqual(clarifyPatch.needs_clarification, true);
    assert.strictEqual(clarifyPatch.clarification_question, 'Уточните сумму ежемесячного пополнения');

    console.log('test_calc_recalculate_patch: OK');
    process.exit(0);
}

run();
