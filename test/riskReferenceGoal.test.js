'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { sortGoalsForCalculationOrder } = require('../src/utils/sortGoalsForCalculation');
const { pickReferenceGoalForRiskProfile } = require('../src/utils/riskReferenceGoal');

test('pickReferenceGoal: FIN_RESERVE and LIFE skipped when INVESTMENT exists', () => {
    const goals = sortGoalsForCalculationOrder([
        { id: 1, goal_type_id: 7, term_months: 12, initial_capital: 1e6, name: 'Резерв' },
        { id: 2, goal_type_id: 3, term_months: 120, initial_capital: 5e5, name: 'Инвест' },
    ]);
    const ref = pickReferenceGoalForRiskProfile(goals);
    assert.strictEqual(ref.id, 2);
});

test('pickReferenceGoal: pension dropped when other type present; max initial_capital', () => {
    const goals = sortGoalsForCalculationOrder([
        { id: 1, goal_type_id: 1, term_months: 200, initial_capital: 9e6, name: 'Пенсия' },
        { id: 2, goal_type_id: 3, term_months: 100, initial_capital: 1e6, name: 'Инвест А' },
        { id: 3, goal_type_id: 4, term_months: 80, initial_capital: 2e6, name: 'Другое Б' },
    ]);
    const ref = pickReferenceGoalForRiskProfile(goals);
    assert.strictEqual(ref.id, 3);
});

test('pickReferenceGoal: only pension left after excluding 7/5 — keep pension', () => {
    const goals = sortGoalsForCalculationOrder([
        { id: 1, goal_type_id: 7, term_months: 12, initial_capital: 0, name: 'Резерв' },
        { id: 2, goal_type_id: 1, term_months: 180, initial_capital: 100, name: 'Пенсия' },
    ]);
    const ref = pickReferenceGoalForRiskProfile(goals);
    assert.strictEqual(ref.id, 2);
});

test('pickReferenceGoal: tie on initial_capital — earlier in sort order wins', () => {
    const g1 = { id: 10, goal_type_id: 3, term_months: 60, initial_capital: 500e3, name: 'A' };
    const g2 = { id: 11, goal_type_id: 4, term_months: 120, initial_capital: 500e3, name: 'B' };
    const goals = sortGoalsForCalculationOrder([g2, g1]);
    const ref = pickReferenceGoalForRiskProfile(goals);
    assert.strictEqual(ref.id, g1.id);
});

test('pickReferenceGoal: empty / no candidates — stub 120', () => {
    assert.deepStrictEqual(pickReferenceGoalForRiskProfile([]), { term_months: 120 });
    const onlyReserve = sortGoalsForCalculationOrder([
        { id: 1, goal_type_id: 7, term_months: 12, initial_capital: 0 },
    ]);
    assert.deepStrictEqual(pickReferenceGoalForRiskProfile(onlyReserve), { term_months: 120 });
});
