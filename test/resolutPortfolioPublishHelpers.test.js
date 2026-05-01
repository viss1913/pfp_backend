'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { extractPortfolioOutcome } = require('../src/utils/resolutPortfolioResponse');
const { buildNszhLikeParameters } = require('../src/services/resolutQuoteLineSuggestService');

test('extractPortfolioOutcome: flat YAML shape (portfolioNumber, clientCode, contracts)', () => {
    const r = extractPortfolioOutcome({
        portfolioNumber: 'PN-1',
        clientCode: 'C99',
        contracts: [{ contractNumber: 'D1', productCode: 'X' }]
    });
    assert.strictEqual(r.portfolio_number, 'PN-1');
    assert.strictEqual(r.client_code, 'C99');
    assert.strictEqual(r.portfolio_code, null);
    assert.strictEqual(r.contracts.length, 1);
});

test('extractPortfolioOutcome: nested content + code', () => {
    const r = extractPortfolioOutcome({
        code: 'prt-abc',
        content: {
            number: 'N-42',
            contracts: [{ contractNumber: 'Z' }]
        }
    });
    assert.strictEqual(r.portfolio_code, 'prt-abc');
    assert.strictEqual(r.portfolio_number, 'N-42');
    assert.strictEqual(r.contracts.length, 1);
});

test('extractPortfolioOutcome: content.contracts wins over empty flat contracts', () => {
    const r = extractPortfolioOutcome({
        contracts: [],
        content: { number: '1', contracts: [{ a: 1 }] }
    });
    assert.strictEqual(r.portfolio_number, '1');
    assert.strictEqual(r.contracts.length, 1);
});

test('buildNszhLikeParameters: byLimit OpenAPI shape (default), no monthlyIncome in calcData', () => {
    const prevPid = process.env.RESOLUT_PROJECT_ID;
    const prevShape = process.env.RESOLUT_NSZH_PARAMETERS_SHAPE;
    const prevInc = process.env.RESOLUT_CALCDATA_MONTHLY_INCOME;
    process.env.RESOLUT_PROJECT_ID = '23';
    delete process.env.RESOLUT_NSZH_PARAMETERS_SHAPE;
    delete process.env.RESOLUT_CALCDATA_MONTHLY_INCOME;
    try {
        const line = buildNszhLikeParameters({
            projectId: 23,
            product: { id: 1, resolut_pfp_code: 'assetShort', resolut_quote_p_type: 0 },
            clientRow: { birth_date: '1990-06-15', gender: 'male', avg_monthly_income: 200000 },
            termMonths: 60,
            amount: 1_000_000,
            valuationType: 'byLimit'
        });
        assert.strictEqual(line.code, 'assetShort');
        assert.deepStrictEqual(line.parameters.pType, { code: 0, name: 'единовременно' });
        assert.deepStrictEqual(line.parameters.currency, { code: 'RUR', name: 'Рубль РФ' });
        assert.strictEqual(line.parameters.term, 5);
        assert.strictEqual(line.parameters.calcData.valuationType, 'byLimit');
        assert.strictEqual(line.parameters.calcData.limit, 1000000);
        assert.strictEqual(Object.prototype.hasOwnProperty.call(line.parameters.calcData, 'monthlyIncome'), false);
        assert.strictEqual(line.parameters.insuredPerson.sex, 'male');
    } finally {
        process.env.RESOLUT_PROJECT_ID = prevPid;
        if (prevShape === undefined) delete process.env.RESOLUT_NSZH_PARAMETERS_SHAPE;
        else process.env.RESOLUT_NSZH_PARAMETERS_SHAPE = prevShape;
        if (prevInc === undefined) delete process.env.RESOLUT_CALCDATA_MONTHLY_INCOME;
        else process.env.RESOLUT_CALCDATA_MONTHLY_INCOME = prevInc;
    }
});

test('buildNszhLikeParameters: monthlyIncome when RESOLUT_CALCDATA_MONTHLY_INCOME=true', () => {
    const prevPid = process.env.RESOLUT_PROJECT_ID;
    const prevInc = process.env.RESOLUT_CALCDATA_MONTHLY_INCOME;
    process.env.RESOLUT_PROJECT_ID = '23';
    process.env.RESOLUT_CALCDATA_MONTHLY_INCOME = 'true';
    try {
        const line = buildNszhLikeParameters({
            projectId: 23,
            product: { id: 1, resolut_pfp_code: 'assetShort', resolut_quote_p_type: 0 },
            clientRow: { birth_date: '1990-06-15', gender: 'male', avg_monthly_income: 200000 },
            termMonths: 60,
            amount: 1_000_000,
            valuationType: 'byLimit'
        });
        assert.strictEqual(line.parameters.calcData.monthlyIncome, 200000);
    } finally {
        process.env.RESOLUT_PROJECT_ID = prevPid;
        if (prevInc === undefined) delete process.env.RESOLUT_CALCDATA_MONTHLY_INCOME;
        else process.env.RESOLUT_CALCDATA_MONTHLY_INCOME = prevInc;
    }
});

test('buildNszhLikeParameters: flat shape when RESOLUT_NSZH_PARAMETERS_SHAPE=flat', () => {
    const prevPid = process.env.RESOLUT_PROJECT_ID;
    const prevShape = process.env.RESOLUT_NSZH_PARAMETERS_SHAPE;
    process.env.RESOLUT_PROJECT_ID = '23';
    process.env.RESOLUT_NSZH_PARAMETERS_SHAPE = 'flat';
    try {
        const line = buildNszhLikeParameters({
            projectId: 23,
            product: { id: 1, resolut_pfp_code: 'assetShort', resolut_quote_p_type: 0 },
            clientRow: { birth_date: '1990-06-15', gender: 'male' },
            termMonths: 60,
            amount: 1_000_000,
            valuationType: 'byLimit'
        });
        assert.strictEqual(line.parameters.pType, 0);
        assert.strictEqual(line.parameters.currency, 'RUR');
    } finally {
        process.env.RESOLUT_PROJECT_ID = prevPid;
        if (prevShape === undefined) delete process.env.RESOLUT_NSZH_PARAMETERS_SHAPE;
        else process.env.RESOLUT_NSZH_PARAMETERS_SHAPE = prevShape;
    }
});

test('buildNszhLikeParameters: throws if product not Resolut-eligible', () => {
    const prev = process.env.RESOLUT_PROJECT_ID;
    process.env.RESOLUT_PROJECT_ID = '23';
    try {
        assert.throws(
            () => buildNszhLikeParameters({
                projectId: 23,
                product: { id: 1, resolut_pfp_code: '' },
                clientRow: {},
                termMonths: 12,
                amount: 100
            }),
            (e) => e.status === 400 && e.error === 'PRODUCT_NOT_RESOLUT_ELIGIBLE'
        );
    } finally {
        process.env.RESOLUT_PROJECT_ID = prev;
    }
});
