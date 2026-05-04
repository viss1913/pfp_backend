'use strict';

const test = require('node:test');
const assert = require('node:assert');

const clientService = require('../src/services/clientService');
const { sortGoalsForCalculationOrder, getPriorityForCalculation } = require('../src/utils/sortGoalsForCalculation');

test('mergeLiabilitiesWithCredits: root credits map to monthly_payment for scoring', () => {
    const rows = clientService.mergeLiabilitiesWithCredits({
        client: { liabilities: [] },
        liabilities: [],
        credits: [{ type: 'MORTGAGE', balance: 1e6, monthlyPayment: 40000, rate: 14 }]
    });
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].monthly_payment, 40000);
});

test('mergeLiabilitiesWithCredits: merges client.liabilities with root credits', () => {
    const rows = clientService.mergeLiabilitiesWithCredits({
        client: {
            liabilities: [{ type: 'OTHER', name: 'x', remaining_amount: 1, monthly_payment: 1000, interest_rate: 0 }]
        },
        liabilities: [],
        credits: [{ type: 'CONSUMER_LOAN', balance: 100, monthlyPayment: 500, rate: 10 }]
    });
    assert.strictEqual(rows.length, 2);
    assert.ok(rows.some((r) => r.monthly_payment === 500));
});

test('sortGoalsForCalculationOrder: fin reserve (7) before pension (1)', () => {
    const goals = [
        { name: 'Пенсия', goal_type_id: 1, term_months: 240 },
        { name: 'Резерв', goal_type_id: 7, term_months: 12 }
    ];
    const sorted = sortGoalsForCalculationOrder(goals);
    assert.strictEqual(sorted[0].goal_type_id, 7);
    assert.strictEqual(sorted[1].goal_type_id, 1);
});

test('getPriorityForCalculation: name RESERVOIR wins', () => {
    assert.strictEqual(getPriorityForCalculation({ name: 'Family RESERVOIR', goal_type_id: 4 }), 1);
});
