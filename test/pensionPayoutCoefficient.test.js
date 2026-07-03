'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const settingsService = require('../src/services/settingsService');

test('normalizePensionGender maps common values', () => {
    assert.equal(settingsService.normalizePensionGender('male'), 'male');
    assert.equal(settingsService.normalizePensionGender('M'), 'male');
    assert.equal(settingsService.normalizePensionGender('мужской'), 'male');
    assert.equal(settingsService.normalizePensionGender('female'), 'female');
    assert.equal(settingsService.normalizePensionGender('F'), 'female');
    assert.equal(settingsService.normalizePensionGender('женский'), 'female');
    assert.equal(settingsService.normalizePensionGender(''), null);
    assert.equal(settingsService.normalizePensionGender(null), null);
});

test('resolvePensionPayoutYield uses table row when present', async () => {
    const originalFind = settingsService.findPensionPayoutCoefficient.bind(settingsService);
    const originalPassive = settingsService.findPassiveIncomeYieldLine.bind(settingsService);

    settingsService.findPensionPayoutCoefficient = async () => ({
        id: 1,
        project_id: 22,
        gender: 'female',
        age: 60,
        coefficient: '3.4000',
    });
    settingsService.findPassiveIncomeYieldLine = async () => {
        throw new Error('passive_income_yield should not be called when table row exists');
    };

    try {
        const resolved = await settingsService.resolvePensionPayoutYield({
            gender: 'female',
            retirementAge: 60,
            monthsToPension: 180,
            projectId: 22,
        });

        assert.equal(resolved.payoutYieldPercent, 3.4);
        assert.equal(resolved.payoutYieldSource, 'pension_payout_coefficients');
        assert.equal(resolved.payoutCoefficient.age, 60);
    } finally {
        settingsService.findPensionPayoutCoefficient = originalFind;
        settingsService.findPassiveIncomeYieldLine = originalPassive;
    }
});

test('resolvePensionPayoutYield falls back to passive_income_yield', async () => {
    const originalFind = settingsService.findPensionPayoutCoefficient.bind(settingsService);
    const originalPassive = settingsService.findPassiveIncomeYieldLine.bind(settingsService);

    settingsService.findPensionPayoutCoefficient = async () => null;
    settingsService.findPassiveIncomeYieldLine = async () => ({ yield_percent: 14 });

    try {
        const resolved = await settingsService.resolvePensionPayoutYield({
            gender: 'male',
            retirementAge: 65,
            monthsToPension: 120,
            projectId: 14,
        });

        assert.equal(resolved.payoutYieldPercent, 14);
        assert.equal(resolved.payoutYieldSource, 'passive_income_yield');
        assert.equal(resolved.payoutCoefficient, null);
    } finally {
        settingsService.findPensionPayoutCoefficient = originalFind;
        settingsService.findPassiveIncomeYieldLine = originalPassive;
    }
});

test('pension payout formulas stay equivalent for coefficient value', () => {
    const coefficient = 3.4;
    const gapMonthly = 50000;
    const capital = 1000000;

    const requiredCapital = (gapMonthly * 12 * 100) / coefficient;
    const pensionMonthly = (capital * coefficient) / 100 / 12;

    assert.ok(requiredCapital > 0);
    assert.ok(pensionMonthly > 0);
    assert.equal(Math.round(pensionMonthly * 100) / 100, Math.round((capital * (coefficient / 100 / 12)) * 100) / 100);
});
