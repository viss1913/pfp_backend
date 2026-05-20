'use strict';

const { test } = require('node:test');
const assert = require('assert');
const iszh = require('../src/algorithms/calculators/iszhSurvivalYield');
const { validateIszhProductLines } = require('../src/utils/validateIszhProductLines');

test('pickBestSurvivalLine chooses Дожитие and yield', () => {
    const yields = [
        {
            risk_name: 'Смерть',
            term_from_months: 0,
            term_to_months: 240,
            amount_from: 0,
            amount_to: 1e12,
            yield_percent: null
        },
        {
            risk_name: 'Дожитие',
            term_from_months: 0,
            term_to_months: 240,
            amount_from: 0,
            amount_to: 1e12,
            age_from: 20,
            age_to: 50,
            yield_percent: 7.5
        }
    ];
    const best = iszh.pickBestSurvivalLine(yields, 120, 35, 1_000_000);
    assert.strictEqual(best.risk_name, 'Дожитие');
    assert.strictEqual(best.yield_percent, 7.5);
});

test('resolveIszhSurvivalYieldsFromMatrix returns survival yield', () => {
    const yields = [
        { risk_name: 'Дожитие', term_from_months: 0, term_to_months: 240, amount_from: 0, amount_to: 1e12, yield_percent: 7.5 }
    ];
    const product = { id: 1, name: 'ИСЖ тест', product_type: 'ISZH', yields };
    const goal = { term_months: 120, start_date: new Date('2026-01-01') };
    const ctx = { client: { birth_date: '1990-06-01' } };
    const { productYield } = iszh.resolveIszhSurvivalYieldsFromMatrix(product, goal, 500_000, ctx);
    assert.strictEqual(productYield, 7.5);
});

test('validateIszhProductLines rejects matrix without survival', () => {
    const bad = validateIszhProductLines([{ risk_name: 'Смерть', yield_percent: 0.1 }]);
    assert.strictEqual(bad.ok, false);
});

test('validateIszhProductLines accepts survival + other risks', () => {
    const good = validateIszhProductLines([
        { risk_name: 'Дожитие', term_from_months: 0, term_to_months: 120, amount_from: 0, amount_to: 1e9, yield_percent: 6 },
        { risk_name: 'Смерть', term_from_months: 0, term_to_months: 120, amount_from: 0, amount_to: 1e9, payment_ratio: 0.6 }
    ]);
    assert.strictEqual(good.ok, true);
});
