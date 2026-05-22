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

test('mergeLiabilitiesWithCredits: credits win over duplicate client.liabilities (no ×2 in report)', () => {
    const rows = clientService.mergeLiabilitiesWithCredits({
        client: {
            liabilities: [
                { type: 'CONSUMER', name: 'Потреб', remaining_amount: 100000, monthly_payment: 20000, interest_rate: 0 },
                { type: 'MORTGAGE', name: 'Ипотека', remaining_amount: 1000000, monthly_payment: 50000, interest_rate: 0 },
            ],
        },
        liabilities: [],
        credits: [
            { type: 'CONSUMER', balance: 100000, monthlyPayment: 20000, rate: 12 },
            { type: 'MORTGAGE', balance: 1000000, monthlyPayment: 50000, rate: 14 },
        ],
    });
    assert.strictEqual(rows.length, 2);
    const total = rows.reduce((sum, r) => sum + r.remaining_amount, 0);
    assert.strictEqual(total, 1100000);
});

test('mergeLiabilitiesWithCredits: prefers credits only when both channels sent (alias contract)', () => {
    const rows = clientService.mergeLiabilitiesWithCredits({
        client: {
            liabilities: [{ type: 'OTHER', name: 'x', remaining_amount: 1, monthly_payment: 1000, interest_rate: 0 }],
        },
        liabilities: [],
        credits: [{ type: 'CONSUMER_LOAN', balance: 100, monthlyPayment: 500, rate: 10 }],
    });
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].remaining_amount, 100);
    assert.strictEqual(rows[0].monthly_payment, 500);
});

test('mergeLiabilitiesWithCredits: dedupes client.liabilities and root liabilities', () => {
    const duplicate = { type: 'MORTGAGE', name: 'Ипотека', remaining_amount: 500000, monthly_payment: 30000, interest_rate: 10 };
    const rows = clientService.mergeLiabilitiesWithCredits({
        client: { liabilities: [duplicate] },
        liabilities: [{ ...duplicate }],
        credits: [],
    });
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].remaining_amount, 500000);
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
