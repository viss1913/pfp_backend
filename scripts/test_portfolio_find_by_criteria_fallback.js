const assert = require('assert');
const portfolioRepository = require('../src/repositories/portfolioRepository');

function testBuildCriteriaAttempts() {
    const attemptsForZero = portfolioRepository._buildCriteriaAttempts({ amount: 0, term: 120 });
    assert.deepStrictEqual(
        attemptsForZero.map(a => [a.useAmount, a.useTerm]),
        [[true, true], [false, true], [false, false]],
        'amount=0 should cascade strict -> no amount -> class only'
    );

    const attemptsNoAmount = portfolioRepository._buildCriteriaAttempts({ amount: undefined, term: 120 });
    assert.deepStrictEqual(
        attemptsNoAmount.map(a => [a.useAmount, a.useTerm]),
        [[false, true], [false, false]],
        'undefined amount should not build strict amount attempt'
    );

    const attemptsNoTerm = portfolioRepository._buildCriteriaAttempts({ amount: 100000, term: undefined });
    assert.deepStrictEqual(
        attemptsNoTerm.map(a => [a.useAmount, a.useTerm]),
        [[true, false], [false, false]],
        'missing term should still fallback to class-only'
    );
}

function testInvalidAmountFallback() {
    const attemptsInvalid = portfolioRepository._buildCriteriaAttempts({ amount: Number.NaN, term: 36 });
    assert.deepStrictEqual(
        attemptsInvalid.map(a => [a.useAmount, a.useTerm]),
        [[false, true], [false, false]],
        'invalid amount should skip amount filter and keep fallback chain'
    );
}

function main() {
    testBuildCriteriaAttempts();
    testInvalidAmountFallback();
    console.log('OK: portfolio findByCriteria fallback tests passed');
}

main();
