'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
    calculatePodushkaPremiums,
    buildSberPodushkaNsjResult,
    resolveActuarialTerm,
} = require('../src/algorithms/calculators/sberPodushkaActuarial');
const {
    resolveLifeTermMonths: resolveLifeTerm,
    IMMERS_TEST_FINAM_PROJECT_ID,
    IMMERS_TEST_FINAM_LIFE_TERM_MONTHS,
} = require('../src/algorithms/calculators/lifeTermDefaults');

// Эталон Podushka final.py: муж 54, 6 лет, SS=650455, sport=2
const PYTHON_EXAMPLE = {
    age: 54,
    gender: 1,
    termMonths: 72,
    ss: 650455,
    sport: 2,
    annualPremium: 14700,
    monthlyPremium: 1325,
    limitMain: 650455,
    limitTrauma: 195135,
};

test('resolveActuarialTerm: 72 months -> 6 years, 72 nMonths', () => {
    const t = resolveActuarialTerm(72);
    assert.strictEqual(t.years, 6);
    assert.strictEqual(t.nMonths, 72);
});

test('resolveLifeTermMonths: goal term wins over project default', () => {
    assert.strictEqual(resolveLifeTerm(IMMERS_TEST_FINAM_PROJECT_ID, 84), 84);
    assert.strictEqual(resolveLifeTerm(IMMERS_TEST_FINAM_PROJECT_ID, null), IMMERS_TEST_FINAM_LIFE_TERM_MONTHS);
    assert.strictEqual(resolveLifeTerm(IMMERS_TEST_FINAM_PROJECT_ID, undefined), IMMERS_TEST_FINAM_LIFE_TERM_MONTHS);
});

test('calculatePodushkaPremiums matches Python example (male 54, 6y, 650455)', () => {
    const r = calculatePodushkaPremiums(PYTHON_EXAMPLE);
    assert.strictEqual(r.years, 6);
    assert.strictEqual(r.termMonths, 72);
    assert.strictEqual(r.annualPremium, PYTHON_EXAMPLE.annualPremium);
    assert.strictEqual(r.monthlyPremium, PYTHON_EXAMPLE.monthlyPremium);
    assert.strictEqual(r.limits.main, PYTHON_EXAMPLE.limitMain);
    assert.strictEqual(r.limits.trauma, PYTHON_EXAMPLE.limitTrauma);
    assert.strictEqual(r.limits.main % 5, 0);
    assert.strictEqual(r.limits.trauma % 5, 0);
    assert.strictEqual(r.annualPremium % 5, 0);
    assert.strictEqual(r.monthlyPremium % 5, 0);
});

test('sport multiplier increases premium', () => {
    const base = calculatePodushkaPremiums(PYTHON_EXAMPLE);
    const sport = calculatePodushkaPremiums({ ...PYTHON_EXAMPLE, sport: 1 });
    assert.ok(sport.annualPremium > base.annualPremium);
    assert.ok(sport.monthlyPremium > base.monthlyPremium);
});

test('buildSberPodushkaNsjResult returns NSJ shape with monthly_premium', () => {
    const refDate = new Date('2026-06-05');
    const birthYear = refDate.getFullYear() - 54;
    const nsj = buildSberPodushkaNsjResult(
        { term_months: 72, target_amount: 650455 },
        { birth_date: `${birthYear}-01-15`, sex: 'male' }
    );
    assert.strictEqual(nsj.success, true);
    assert.strictEqual(nsj.program, 'Подушка безопасности');
    assert.strictEqual(nsj.term_years, 6);
    assert.strictEqual(nsj.term_months, 72);
    assert.strictEqual(nsj.total_premium, PYTHON_EXAMPLE.annualPremium);
    assert.strictEqual(nsj.monthly_premium, PYTHON_EXAMPLE.monthlyPremium);
    assert.ok(Array.isArray(nsj.risks) && nsj.risks.length === 5);
});

test('different term months recalculates premium', () => {
    const six = calculatePodushkaPremiums({ ...PYTHON_EXAMPLE, termMonths: 72 });
    const five = calculatePodushkaPremiums({ ...PYTHON_EXAMPLE, termMonths: 60 });
    assert.notStrictEqual(six.annualPremium, five.annualPremium);
});
