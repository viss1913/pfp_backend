const assert = require('assert');
const {
    resolveCofinancingDisplayAmounts,
} = require('../src/reports/themes/rostech/rostechPdfUtils');

function testPartialFirstYearTakesMaxOfNextTwo() {
    const result = resolveCofinancingDisplayAmounts({
        monthlySchedule: [
            { date: '2027-08-01', cofinancing: 5000 },
            { date: '2028-08-01', cofinancing: 12000 },
        ],
        benefitsYear: 2027,
        fallbackNextYearAmount: 0,
    });

    assert.strictEqual(result.nextYearAmount, 5000);
    assert.strictEqual(result.followingYearAmount, 12000);
    assert.strictEqual(result.maxPerYear, 12000);
}

function testFallbackWhenScheduleEmpty() {
    const result = resolveCofinancingDisplayAmounts({
        monthlySchedule: [],
        yearlyBreakdown: [],
        benefitsYear: 2027,
        fallbackNextYearAmount: 5000,
    });

    assert.strictEqual(result.nextYearAmount, 5000);
    assert.strictEqual(result.maxPerYear, 5000);
}

function testYearlyBreakdownFallback() {
    const result = resolveCofinancingDisplayAmounts({
        monthlySchedule: null,
        yearlyBreakdown: [
            { year: 2027, cofinancing_for_year: 5000 },
            { year: 2028, cofinancing_for_year: 9000 },
        ],
        benefitsYear: 2027,
    });

    assert.strictEqual(result.nextYearAmount, 5000);
    assert.strictEqual(result.maxPerYear, 9000);
}

testPartialFirstYearTakesMaxOfNextTwo();
testFallbackWhenScheduleEmpty();
testYearlyBreakdownFallback();
console.log('resolveCofinancingDisplayAmounts.test.js: ok');
