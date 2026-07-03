'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const settingsService = require('../src/services/settingsService');
const PensionCalculator = require('../src/algorithms/calculators/PensionCalculator');

const MATRIX_LINES = [
    { min_term_months: 0, max_term_months: 360, min_amount: 0, max_amount: 1e12, yield_percent: 8, gender: null, age: null },
    { min_term_months: 0, max_term_months: 360, min_amount: 0, max_amount: 1e12, yield_percent: 3.4, gender: 'female', age: 60 },
    { min_term_months: 0, max_term_months: 360, min_amount: 0, max_amount: 500000, yield_percent: 5, gender: 'male', age: 65 },
    { min_term_months: 0, max_term_months: 360, min_amount: 500001, max_amount: 1e12, yield_percent: 4, gender: 'male', age: 65 },
];

test('findPassiveIncomeYieldLine: pension row by gender, age, term, capital', async () => {
    const original = settingsService.getPassiveIncomeYield.bind(settingsService);
    settingsService.getPassiveIncomeYield = async () => ({ lines: MATRIX_LINES });

    try {
        const line = await settingsService.findPassiveIncomeYieldLine(
            2_000_000,
            180,
            false,
            22,
            { gender: 'female', age: 60 }
        );
        assert.equal(line.yield_percent, 3.4);
        assert.equal(line.gender, 'female');
    } finally {
        settingsService.getPassiveIncomeYield = original;
    }
});

test('findPassiveIncomeYieldLine: capital bracket for male 65', async () => {
    const original = settingsService.getPassiveIncomeYield.bind(settingsService);
    settingsService.getPassiveIncomeYield = async () => ({ lines: MATRIX_LINES });

    try {
        const low = await settingsService.findPassiveIncomeYieldLine(400000, 120, false, 22, { gender: 'male', age: 65 });
        const high = await settingsService.findPassiveIncomeYieldLine(800000, 120, false, 22, { gender: 'male', age: 65 });
        assert.equal(low.yield_percent, 5);
        assert.equal(high.yield_percent, 4);
    } finally {
        settingsService.getPassiveIncomeYield = original;
    }
});

test('findPassiveIncomeYieldLine: passive income ignores gender-specific rows', async () => {
    const original = settingsService.getPassiveIncomeYield.bind(settingsService);
    settingsService.getPassiveIncomeYield = async () => ({ lines: MATRIX_LINES });

    try {
        const line = await settingsService.findPassiveIncomeYieldLine(0, 120, true, 22);
        assert.equal(line.yield_percent, 8);
        assert.equal(line.gender, null);
    } finally {
        settingsService.getPassiveIncomeYield = original;
    }
});

test('resolvePensionPayoutYield uses full matrix', async () => {
    const original = settingsService.getPassiveIncomeYield.bind(settingsService);
    settingsService.getPassiveIncomeYield = async () => ({ lines: MATRIX_LINES });

    try {
        const resolved = await settingsService.resolvePensionPayoutYield({
            amount: 1_000_000,
            gender: 'female',
            ageAtGoal: 60,
            monthsToPension: 200,
            projectId: 22,
        });
        assert.equal(resolved.payoutYieldPercent, 3.4);
        assert.equal(resolved.payoutYieldSource, 'passive_income_yield');
        assert.equal(resolved.payoutLine.age, 60);
    } finally {
        settingsService.getPassiveIncomeYield = original;
    }
});

test('calculateStatePension: age_at_goal = current age + years_to_pension (F60, M65)', async () => {
    const calc = PensionCalculator;
    const settings = { inflation_rate: 4 };

    const female = await calc.calculateStatePension(
        { birth_date: '1981-06-15', gender: 'female', avg_monthly_income: 100000 },
        settings,
        new Date('2026-01-01')
    );
    assert.equal(female.retirement_age, 60);
    assert.equal(female.age, 45);
    assert.equal(female.years_to_pension, 15);
    assert.equal(female.age_at_goal, 60);

    const male = await calc.calculateStatePension(
        { birth_date: '1976-03-10', gender: 'male', avg_monthly_income: 100000 },
        settings,
        new Date('2026-01-01')
    );
    assert.equal(male.retirement_age, 65);
    assert.equal(male.age, 50);
    assert.equal(male.years_to_pension, 15);
    assert.equal(male.age_at_goal, 65);
});

test('resolvePensionPayoutYield: female already past retirement uses current age_at_goal', async () => {
    const original = settingsService.getPassiveIncomeYield.bind(settingsService);
    settingsService.getPassiveIncomeYield = async () => ({ lines: MATRIX_LINES });

    try {
        const calc = PensionCalculator;
        const state = await calc.calculateStatePension(
            { birth_date: '1960-01-01', gender: 'female', avg_monthly_income: 80000 },
            { inflation_rate: 4 },
            new Date('2026-01-01')
        );
        assert.equal(state.years_to_pension, 0);
        assert.equal(state.age_at_goal, 66);

        const resolved = await settingsService.resolvePensionPayoutYield({
            amount: 500000,
            gender: 'female',
            ageAtGoal: state.age_at_goal,
            monthsToPension: 0,
            projectId: 22,
        });
        assert.equal(resolved.payoutYieldPercent, 8);
        assert.equal(resolved.payoutLine.gender, null);
    } finally {
        settingsService.getPassiveIncomeYield = original;
    }
});
