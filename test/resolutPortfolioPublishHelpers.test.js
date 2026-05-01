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

test('buildNszhLikeParameters: byLimit uses client and product resolut code', () => {
    const prev = process.env.RESOLUT_PROJECT_ID;
    process.env.RESOLUT_PROJECT_ID = '23';
    try {
        const line = buildNszhLikeParameters({
            projectId: 23,
            product: { id: 1, resolut_pfp_code: 'assetShort', resolut_quote_p_type: 0 },
            clientRow: { birth_date: '1990-06-15', gender: 'male' },
            termMonths: 60,
            amount: 1_000_000,
            valuationType: 'byLimit'
        });
        assert.strictEqual(line.code, 'assetShort');
        assert.strictEqual(line.parameters.pType, 0);
        assert.strictEqual(line.parameters.term, 5);
        assert.strictEqual(line.parameters.calcData.valuationType, 'byLimit');
        assert.strictEqual(line.parameters.calcData.limit, 1000000);
        assert.strictEqual(line.parameters.insuredPerson.sex, 'male');
    } finally {
        process.env.RESOLUT_PROJECT_ID = prev;
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
