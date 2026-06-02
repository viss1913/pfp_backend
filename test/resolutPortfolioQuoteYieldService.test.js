'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
    impliedAnnualPercentFromLumpSum,
    pickSurvivalFv,
    isResolutPortfolioProduct,
    getImpliedAnnualYieldPercentFromQuote
} = require('../src/services/resolutPortfolioQuoteYieldService');

test('impliedAnnualPercentFromLumpSum: 5y lump 2M -> ~2.152M gives small positive annual %', () => {
    const ann = impliedAnnualPercentFromLumpSum({
        pv: 2000000,
        fv: 2152000,
        termMonths: 60
    });
    assert.ok(ann > 1 && ann < 2, `expected ~1.4-1.5%, got ${ann}`);
});

test('pickSurvivalFv prefers survival risk', () => {
    const fv = pickSurvivalFv({
        limit: 2000000,
        risks: [
            { code: 'NadezhnyjAktivBaseSurvival01', name: 'Дожитие', limit: 2150000 },
            { code: 'Death', name: 'Смерть', limit: 1000 }
        ]
    });
    assert.strictEqual(fv, 2150000);
});

test('isResolutPortfolioProduct: only RESOLUT_PROJECT_ID and non-empty code', () => {
    const prev = process.env.RESOLUT_PROJECT_ID;
    process.env.RESOLUT_PROJECT_ID = '23';
    try {
        const p = { id: 1, resolut_pfp_code: 'assetShort' };
        assert.strictEqual(isResolutPortfolioProduct(p, 23), true);
        assert.strictEqual(isResolutPortfolioProduct(p, 14), false);
        assert.strictEqual(isResolutPortfolioProduct({ ...p, resolut_pfp_code: '' }, 23), false);
        assert.strictEqual(isResolutPortfolioProduct({ ...p, resolut_pfp_code: null }, 23), false);
    } finally {
        if (prev === undefined) delete process.env.RESOLUT_PROJECT_ID;
        else process.env.RESOLUT_PROJECT_ID = prev;
    }
});

test('getImpliedAnnualYieldPercentFromQuote returns null when project is not Resolut tenant', async () => {
    const prev = process.env.RESOLUT_PROJECT_ID;
    process.env.RESOLUT_PROJECT_ID = '23';
    try {
        const r = await getImpliedAnnualYieldPercentFromQuote({
            product: { id: 1, resolut_pfp_code: 'assetShort' },
            termMonths: 60,
            allocatedAmount: 1_000_000,
            projectId: 14,
            userId: null,
            client: {}
        });
        assert.strictEqual(r, null);
    } finally {
        if (prev === undefined) delete process.env.RESOLUT_PROJECT_ID;
        else process.env.RESOLUT_PROJECT_ID = prev;
    }
});

test('getImpliedAnnualYieldPercentFromQuote returns null without resolut_pfp_code on product', async () => {
    const prev = process.env.RESOLUT_PROJECT_ID;
    process.env.RESOLUT_PROJECT_ID = '23';
    try {
        const r = await getImpliedAnnualYieldPercentFromQuote({
            product: { id: 1, resolut_pfp_code: null },
            termMonths: 60,
            allocatedAmount: 1_000_000,
            projectId: 23,
            userId: null,
            client: {}
        });
        assert.strictEqual(r, null);
    } finally {
        if (prev === undefined) delete process.env.RESOLUT_PROJECT_ID;
        else process.env.RESOLUT_PROJECT_ID = prev;
    }
});

test('getImpliedAnnualYieldPercentFromQuote returns null for DEPOSIT/PDS until profity semantics are confirmed', async () => {
    const prev = process.env.RESOLUT_PROJECT_ID;
    process.env.RESOLUT_PROJECT_ID = '23';
    try {
        const r = await getImpliedAnnualYieldPercentFromQuote({
            product: { id: 7, resolut_pfp_code: 'depAlfa', product_type: 'DEPOSIT' },
            termMonths: 12,
            allocatedAmount: 2_000_000,
            projectId: 23,
            userId: null,
            client: {}
        });
        assert.strictEqual(r, null);
    } finally {
        if (prev === undefined) delete process.env.RESOLUT_PROJECT_ID;
        else process.env.RESOLUT_PROJECT_ID = prev;
    }
});
