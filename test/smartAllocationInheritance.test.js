'use strict';

const test = require('node:test');
const assert = require('node:assert');

const calculationService = require('../src/services/calculationService');

function makeContext(poolAmount) {
    return {
        poolBalance: poolAmount,
        sharedPoolEvents: [{ month: 0, amount: poolAmount }],
        smartAllocationInvRentShare: 0.6,
        client: {},
    };
}

function indexed(goals) {
    return goals.map((goal, index) => ({ goal, index }));
}

test('smart allocation: inheritance reserves initial_capital before investment slice', async () => {
    const goals = [
        { id: 1, name: 'Резерв', goal_type_id: 7, initial_capital: 1_000_000, term_months: 12 },
        { id: 2, name: 'Наследство', goal_type_id: 11, initial_capital: 2_000_000, target_amount: 10_000_000, term_months: 120 },
        { id: 3, name: 'Инвестиции', goal_type_id: 3, target_amount: 5_000_000, term_months: 60 },
    ];
    const items = indexed(goals);
    const context = makeContext(10_000_000);

    await calculationService._calculateSmartAllocation(items, context);

    assert.strictEqual(items[0].goal.smart_initial_capital, 1_000_000);
    assert.strictEqual(items[1].goal.smart_initial_capital, 2_000_000);
    assert.strictEqual(items[2].goal.smart_initial_capital, 7_000_000);
});

test('smart allocation: inheritance initial_capital 0 skips pool; investment gets remainder', async () => {
    const goals = [
        { id: 1, name: 'Резерв', goal_type_id: 7, initial_capital: 1_000_000, term_months: 12 },
        { id: 2, name: 'Наследство', goal_type_id: 11, initial_capital: 0, target_amount: 8_000_000, term_months: 120 },
        { id: 3, name: 'Инвестиции', goal_type_id: 3, target_amount: 5_000_000, term_months: 60 },
    ];
    const items = indexed(goals);
    const context = makeContext(10_000_000);

    await calculationService._calculateSmartAllocation(items, context);

    assert.strictEqual(items[1].goal.smart_initial_capital, 0);
    assert.strictEqual(items[2].goal.smart_initial_capital, 9_000_000);
});

test('smart allocation: inheritance not in investment phase2 bucket with second investment goal', async () => {
    const goals = [
        { id: 1, name: 'Наследство', goal_type_id: 11, initial_capital: 500_000, term_months: 60 },
        { id: 2, name: 'Инвест A', goal_type_id: 3, target_amount: 3_000_000, term_months: 60 },
        { id: 3, name: 'Инвест B', goal_type_id: 3, target_amount: 1_000_000, term_months: 60 },
    ];
    const items = indexed(goals);
    const context = makeContext(2_000_000);

    await calculationService._calculateSmartAllocation(items, context);

    assert.strictEqual(items[0].goal.smart_initial_capital, 500_000);
    const invTotal =
        Number(items[1].goal.smart_initial_capital) + Number(items[2].goal.smart_initial_capital);
    assert.strictEqual(invTotal, 1_500_000);
    assert.ok(items[1].goal.smart_initial_capital > items[2].goal.smart_initial_capital);
});
