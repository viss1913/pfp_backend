'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { normalizeMysqlDate, coerceBirthYear } = require('../src/utils/normalizeMysqlDate');

test('normalizeMysqlDate: фронт ЛК 19980-08-24 → 1980-08-24', () => {
    assert.strictEqual(normalizeMysqlDate('19980-08-24'), '1980-08-24');
});

test('normalizeMysqlDate: обычная дата без изменений', () => {
    assert.strictEqual(normalizeMysqlDate('1980-08-15'), '1980-08-15');
    assert.strictEqual(normalizeMysqlDate('1990-06-01'), '1990-06-01');
});

test('normalizeMysqlDate: мусор и loose Date не проходят', () => {
    assert.strictEqual(normalizeMysqlDate('+019980-08'), null);
    assert.strictEqual(normalizeMysqlDate('not-a-date'), null);
});

test('coerceBirthYear: только паттерн 199XX с лишней девяткой', () => {
    assert.strictEqual(coerceBirthYear(19980), 1980);
    assert.strictEqual(coerceBirthYear(1990), 1990);
    assert.strictEqual(coerceBirthYear(20080), 20080);
});
