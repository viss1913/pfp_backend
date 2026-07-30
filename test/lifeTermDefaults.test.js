'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
    FINAM_PROJECT_ID,
    FINAM_LIFE_TERM_MONTHS,
    IMMERS_TEST_FINAM_PROJECT_ID,
    IMMERS_TEST_FINAM_LIFE_TERM_MONTHS,
    fixedLifeTermMonthsForProject,
    fixedLifeTermYearsForProject,
    resolveLifeTermMonths,
} = require('../src/algorithms/calculators/lifeTermDefaults');

test('Finam LIFE default term is 5 years', () => {
    assert.strictEqual(fixedLifeTermMonthsForProject(FINAM_PROJECT_ID), FINAM_LIFE_TERM_MONTHS);
    assert.strictEqual(fixedLifeTermMonthsForProject(FINAM_PROJECT_ID), 60);
    assert.strictEqual(fixedLifeTermYearsForProject(FINAM_PROJECT_ID), 5);
});

test('Sber LIFE default term stays 15 years', () => {
    assert.strictEqual(fixedLifeTermMonthsForProject(28), 180);
    assert.strictEqual(fixedLifeTermMonthsForProject(29), 180);
    assert.strictEqual(fixedLifeTermYearsForProject(29), 15);
});

test('Immers test Finam LIFE default term is 6 years', () => {
    assert.strictEqual(fixedLifeTermMonthsForProject(IMMERS_TEST_FINAM_PROJECT_ID), IMMERS_TEST_FINAM_LIFE_TERM_MONTHS);
    assert.strictEqual(fixedLifeTermMonthsForProject(2), 72);
    assert.strictEqual(fixedLifeTermYearsForProject(2), 6);
});

test('resolveLifeTermMonths prefers goal term over project default', () => {
    assert.strictEqual(resolveLifeTermMonths(2, 84), 84);
    assert.strictEqual(resolveLifeTermMonths(2, null), 72);
    assert.strictEqual(resolveLifeTermMonths(14, 48), 48);
    assert.strictEqual(resolveLifeTermMonths(14, null), 60);
});

test('unknown project has no fixed LIFE term', () => {
    assert.strictEqual(fixedLifeTermMonthsForProject(22), null);
    assert.strictEqual(resolveLifeTermMonths(22, null), 120);
});
