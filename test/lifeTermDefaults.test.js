'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
    FINAM_PROJECT_ID,
    FINAM_LIFE_TERM_MONTHS,
    fixedLifeTermMonthsForProject,
    fixedLifeTermYearsForProject,
} = require('../src/algorithms/calculators/lifeTermDefaults');

test('Finam LIFE default term is 5 years', () => {
    assert.strictEqual(fixedLifeTermMonthsForProject(FINAM_PROJECT_ID), FINAM_LIFE_TERM_MONTHS);
    assert.strictEqual(fixedLifeTermMonthsForProject(FINAM_PROJECT_ID), 60);
    assert.strictEqual(fixedLifeTermYearsForProject(FINAM_PROJECT_ID), 5);
});

test('Sber LIFE default term stays 15 years', () => {
    assert.strictEqual(fixedLifeTermMonthsForProject(29), 180);
    assert.strictEqual(fixedLifeTermYearsForProject(29), 15);
});

test('unknown project has no fixed LIFE term', () => {
    assert.strictEqual(fixedLifeTermMonthsForProject(22), null);
});
