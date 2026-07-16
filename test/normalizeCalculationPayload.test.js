const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    parseMoneyishNumber,
    normalizeFlexibleDate,
    normalizeCalculationRequestBody,
} = require('../src/utils/normalizeCalculationPayload');

test('parseMoneyishNumber handles spaced RU amounts', () => {
    assert.equal(parseMoneyishNumber('150 000'), 150000);
    assert.equal(parseMoneyishNumber('100\u00a0000'), 100000);
    assert.equal(parseMoneyishNumber('150\u202f000'), 150000);
    assert.equal(parseMoneyishNumber('150 000 ₽'), 150000);
    assert.equal(parseMoneyishNumber('1 234,56'), 1234.56);
});

test('normalizeFlexibleDate parses DD.MM.YYYY', () => {
    assert.equal(normalizeFlexibleDate('15.06.1985'), '1985-06-15');
});

test('normalizeCalculationRequestBody coerces mobile calculate payload', () => {
    const body = {
        client: {
            email: 'a@test.com',
            birth_date: '15.06.1985',
            avg_monthly_income: '150 000',
        },
        goals: [{ goal_type_id: 1, name: 'Pensiya', desired_monthly_income: '100 000' }],
    };

    normalizeCalculationRequestBody(body);

    assert.equal(body.client.birth_date, '1985-06-15');
    assert.equal(body.client.avg_monthly_income, 150000);
    assert.equal(body.goals[0].desired_monthly_income, 100000);
});
