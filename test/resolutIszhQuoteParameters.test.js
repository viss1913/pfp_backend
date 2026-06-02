'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
    isResolutIszhProduct,
    buildIszhLikeParameters,
    parseIszhPfpCodes,
    normalizeIszhQuoteParameters
} = require('../src/services/resolutIszhQuoteParameters');
const { buildResolutQuoteParameters, normalizeResolutQuoteLine } = require('../src/services/resolutQuoteParameters');
const {
    isResolutDepositLikeProduct,
    normalizeDepositClientType,
    resolveDepositTermValue
} = require('../src/services/resolutDepositQuoteParameters');

test('parseIszhPfpCodes: default capital', () => {
    const prev = process.env.RESOLUT_ISZH_PFP_CODES;
    delete process.env.RESOLUT_ISZH_PFP_CODES;
    try {
        assert.deepStrictEqual(parseIszhPfpCodes(), ['capital']);
    } finally {
        if (prev !== undefined) process.env.RESOLUT_ISZH_PFP_CODES = prev;
    }
});

test('isResolutIszhProduct: by product_type or pfp code', () => {
    assert.strictEqual(isResolutIszhProduct({ product_type: 'ISZH', resolut_pfp_code: 'x' }), true);
    assert.strictEqual(isResolutIszhProduct({ product_type: 'NSZH', resolut_pfp_code: 'capital' }), true);
    assert.strictEqual(isResolutIszhProduct({ product_type: 'NSZH', resolut_pfp_code: 'assetShort' }), false);
});

test('buildIszhLikeParameters: premium + insuredPerson', () => {
    const prev = process.env.RESOLUT_PROJECT_ID;
    process.env.RESOLUT_PROJECT_ID = '23';
    try {
        const line = buildIszhLikeParameters({
            projectId: 23,
            product: { resolut_pfp_code: 'capital', product_type: 'ISZH' },
            clientRow: { birth_date: '1990-05-15', gender: 'male' },
            amount: 1500000
        });
        assert.strictEqual(line.code, 'capital');
        assert.strictEqual(line.parameters.calcData.premium, 1500000);
        assert.match(line.parameters.insuredPerson.dob, /^\d{2}\.\d{2}\.\d{4}$/);
        assert.strictEqual(line.parameters.insuredPerson.sex, 'male');
        assert.strictEqual(line.parameters.term, undefined);
    } finally {
        if (prev !== undefined) process.env.RESOLUT_PROJECT_ID = prev;
        else delete process.env.RESOLUT_PROJECT_ID;
    }
});

test('normalizeIszhQuoteParameters: NSZH-shaped limit → calcData.premium', () => {
    const prev = process.env.RESOLUT_PROJECT_ID;
    process.env.RESOLUT_PROJECT_ID = '23';
    try {
        const out = normalizeIszhQuoteParameters({
            projectId: 23,
            code: 'capital',
            parameters: {
                currency: 'RUR',
                pType: 0,
                term: 1,
                calcData: { valuationType: 'byLimit', limit: 2000000 },
                insuredPerson: { dob: '15.05.1990', sex: 'male' }
            }
        });
        assert.strictEqual(out.calcData.premium, 2000000);
        assert.strictEqual(out.calcData.limit, undefined);
        assert.strictEqual(out.term, undefined);
    } finally {
        if (prev !== undefined) process.env.RESOLUT_PROJECT_ID = prev;
        else delete process.env.RESOLUT_PROJECT_ID;
    }
});

test('normalizeResolutQuoteLine: capital code without product row', () => {
    const prev = process.env.RESOLUT_PROJECT_ID;
    process.env.RESOLUT_PROJECT_ID = '23';
    try {
        const line = normalizeResolutQuoteLine({
            projectId: 23,
            code: 'capital',
            parameters: {
                calcData: { limit: 1500000 },
                insuredPerson: { dob: '01.01.1990' }
            }
        });
        assert.strictEqual(line.code, 'capital');
        assert.strictEqual(line.parameters.calcData.premium, 1500000);
    } finally {
        if (prev !== undefined) process.env.RESOLUT_PROJECT_ID = prev;
        else delete process.env.RESOLUT_PROJECT_ID;
    }
});

test('buildResolutQuoteParameters routes NSZH vs ISZH', () => {
    const prev = process.env.RESOLUT_PROJECT_ID;
    process.env.RESOLUT_PROJECT_ID = '23';
    try {
        const iszh = buildResolutQuoteParameters({
            projectId: 23,
            product: { resolut_pfp_code: 'capital', product_type: 'ISZH' },
            clientRow: { birth_date: '1985-01-01' },
            amount: 2000000
        });
        assert.strictEqual(iszh.parameters.calcData.premium, 2000000);

        const nszh = buildResolutQuoteParameters({
            projectId: 23,
            product: { resolut_pfp_code: 'assetShort', product_type: 'NSZH', resolut_quote_p_type: 0 },
            clientRow: { birth_date: '1985-01-01', gender: 'male' },
            termMonths: 60,
            amount: 1000000,
            valuationType: 'byLimit'
        });
        assert.strictEqual(nszh.code, 'assetShort');
        assert.ok(nszh.parameters.calcData.limit === 1000000 || nszh.parameters.calcData.valuationType);
    } finally {
        if (prev !== undefined) process.env.RESOLUT_PROJECT_ID = prev;
        else delete process.env.RESOLUT_PROJECT_ID;
    }
});

test('isResolutDepositLikeProduct: detects DEPOSIT and PDS', () => {
    assert.strictEqual(isResolutDepositLikeProduct({ product_type: 'DEPOSIT' }), true);
    assert.strictEqual(isResolutDepositLikeProduct({ product_type: 'PDS' }), true);
    assert.strictEqual(isResolutDepositLikeProduct({ product_type: 'NSZH' }), false);
});

test('normalizeDepositClientType: accepts string and object', () => {
    assert.deepStrictEqual(normalizeDepositClientType('common'), { code: 'common', name: 'Общий' });
    assert.deepStrictEqual(normalizeDepositClientType({ code: 'private', name: 'VIP' }), { code: 'private', name: 'Привилегированный' });
});

test('resolveDepositTermValue: deposit uses months, PDS uses years', () => {
    assert.strictEqual(resolveDepositTermValue({ product_type: 'DEPOSIT' }, 18), 18);
    assert.strictEqual(resolveDepositTermValue({ product_type: 'PDS' }, 60), 5);
});

test('buildResolutQuoteParameters: DEPOSIT builds clientType + calcData', () => {
    const prev = process.env.RESOLUT_PROJECT_ID;
    process.env.RESOLUT_PROJECT_ID = '23';
    try {
        const line = buildResolutQuoteParameters({
            projectId: 23,
            product: { resolut_pfp_code: 'depAlfa', product_type: 'DEPOSIT' },
            termMonths: 12,
            amount: 2000000,
            clientType: 'common',
            capitalise: false
        });
        assert.strictEqual(line.code, 'depAlfa');
        assert.deepStrictEqual(line.parameters.clientType, { code: 'common', name: 'Общий' });
        assert.deepStrictEqual(line.parameters.calcData, {
            limit: 2000000,
            capitalise: false,
            term: 12
        });
    } finally {
        if (prev !== undefined) process.env.RESOLUT_PROJECT_ID = prev;
        else delete process.env.RESOLUT_PROJECT_ID;
    }
});

test('buildResolutQuoteParameters: PDS maps termMonths to years', () => {
    const prev = process.env.RESOLUT_PROJECT_ID;
    process.env.RESOLUT_PROJECT_ID = '23';
    try {
        const line = buildResolutQuoteParameters({
            projectId: 23,
            product: { resolut_pfp_code: 'pdsAlfa', product_type: 'PDS' },
            termMonths: 60,
            amount: 2000000,
            clientType: { code: 'private' },
            capitalise: true
        });
        assert.strictEqual(line.code, 'pdsAlfa');
        assert.deepStrictEqual(line.parameters.clientType, { code: 'private', name: 'Привилегированный' });
        assert.deepStrictEqual(line.parameters.calcData, {
            limit: 2000000,
            capitalise: true,
            term: 5
        });
    } finally {
        if (prev !== undefined) process.env.RESOLUT_PROJECT_ID = prev;
        else delete process.env.RESOLUT_PROJECT_ID;
    }
});

test('normalizeResolutQuoteLine: deposit-like parameters normalize clientType string', () => {
    const line = normalizeResolutQuoteLine({
        projectId: 23,
        code: 'depAlfa',
        parameters: {
            clientType: 'common',
            calcData: {
                limit: 2000000,
                capitalise: false,
                term: 12
            }
        }
    });
    assert.strictEqual(line.code, 'depAlfa');
    assert.deepStrictEqual(line.parameters.clientType, { code: 'common', name: 'Общий' });
    assert.deepStrictEqual(line.parameters.calcData, {
        limit: 2000000,
        capitalise: false,
        term: 12
    });
});

test('normalizeResolutQuoteLine: deposit-like payload without clientType fails closed', () => {
    assert.throws(() => normalizeResolutQuoteLine({
        projectId: 23,
        code: 'depAlfa',
        parameters: {
            calcData: {
                limit: 2000000,
                capitalise: false,
                term: 12
            }
        }
    }), (err) => {
        assert.strictEqual(err.error, 'INVALID_RESOLUT_CLIENT_TYPE');
        assert.match(err.message, /clientType is required/);
        return true;
    });
});

test('normalizeResolutQuoteLine: deposit-like payload requires explicit capitalise boolean', () => {
    assert.throws(() => normalizeResolutQuoteLine({
        projectId: 23,
        code: 'depAlfa',
        parameters: {
            clientType: 'common',
            calcData: {
                limit: 2000000,
                term: 12
            }
        }
    }), (err) => {
        assert.strictEqual(err.error, 'INVALID_RESOLUT_DEPOSIT_CAPITALISE');
        assert.match(err.message, /capitalise must be explicitly set/);
        return true;
    });
});
