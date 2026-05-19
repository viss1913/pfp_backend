const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeGender } = require('../../src/utils/normalizeGender');

test('normalizeGender maps common values', () => {
    assert.equal(normalizeGender('male'), 'male');
    assert.equal(normalizeGender('M'), 'male');
    assert.equal(normalizeGender('мужской'), 'male');
    assert.equal(normalizeGender('female'), 'female');
    assert.equal(normalizeGender('F'), 'female');
    assert.equal(normalizeGender('женский'), 'female');
    assert.equal(normalizeGender(''), null);
    assert.equal(normalizeGender('other'), null);
});
