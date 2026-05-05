'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { getMortgageLeverageSnapshot, applyLtvDebtBonus } = require('../src/utils/mortgageLeverageRisk');

test('LTV 6M / 20M: liability_match and +1 debt bonus from base 2', () => {
    const client = {
        family_profile: {
            real_estate: [{ estimated_value: 20e6, status: 'mortgage' }],
        },
        liabilities: [
            { type: 'MORTGAGE', remaining_amount: 6e6, monthly_payment: 40e3 },
        ],
    };
    const snap = getMortgageLeverageSnapshot(client);
    assert.strictEqual(snap.source, 'liability_match');
    assert.ok(Math.abs(snap.ltv - 0.3) < 1e-9);
    const { debtScore, debt_adjustment } = applyLtvDebtBonus(2, snap);
    assert.strictEqual(debt_adjustment, 1);
    assert.strictEqual(debtScore, 3);
});

test('no real estate value — no LTV, no adjustment', () => {
    const client = {
        family_profile: { real_estate: [] },
        liabilities: [{ type: 'MORTGAGE', remaining_amount: 6e6, monthly_payment: 1 }],
    };
    const snap = getMortgageLeverageSnapshot(client);
    assert.strictEqual(snap.ltv, null);
    const { debtScore, debt_adjustment } = applyLtvDebtBonus(2, snap);
    assert.strictEqual(debt_adjustment, 0);
    assert.strictEqual(debtScore, 2);
});

test('single OTHER liability + mortgage real_estate fallback', () => {
    const client = {
        family_profile: {
            real_estate: [{ estimated_value: 10e6, status: 'mortgage' }],
        },
        liabilities: [{ type: 'OTHER', name: 'Кредит', remaining_amount: 5e6, monthly_payment: 1 }],
    };
    const snap = getMortgageLeverageSnapshot(client);
    assert.strictEqual(snap.source, 'single_liability_fallback');
    assert.strictEqual(snap.mortgage_remaining, 5e6);
    assert.strictEqual(snap.ltv, 0.5);
    const { debt_adjustment } = applyLtvDebtBonus(3, snap);
    assert.strictEqual(debt_adjustment, 0.5);
});
