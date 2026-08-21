const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    isPublicMacroPath,
    publicMacroCorsOptions,
    LANDING_MACRO_SLUGS,
    PUBLIC_MACRO_PATHS,
} = require('../../src/utils/publicMacroAccess');

test('isPublicMacroPath matches latest and public-latest under /api', () => {
    assert.equal(isPublicMacroPath('/api/pfp/macro/latest'), true);
    assert.equal(isPublicMacroPath('/api/pfp/macro/public-latest'), true);
    assert.equal(isPublicMacroPath('/pfp/macro/latest'), true);
    assert.equal(isPublicMacroPath('/api/pfp/macro/latest?x=1'), true);
    assert.equal(isPublicMacroPath({ originalUrl: '/api/pfp/macro/public-latest' }), true);
    assert.equal(isPublicMacroPath('/api/pfp/macro/history/usd_rub'), false);
    assert.equal(isPublicMacroPath('/api/pfp/macro/sync'), false);
});

test('publicMacroCorsOptions is star origin GET/OPTIONS without credentials', () => {
    const opts = publicMacroCorsOptions();
    assert.equal(opts.origin, '*');
    assert.equal(opts.credentials, false);
    assert.deepEqual(opts.methods, ['GET', 'OPTIONS']);
});

test('landing slugs cover the six FO market rows', () => {
    assert.deepEqual([...LANDING_MACRO_SLUGS], [
        'cbr_key_rate',
        'russia_cpi_inflation_yoy',
        'cbr_deposit_rate_max',
        'moex_ofz_gcurve_5y',
        'moex_imoex',
        'usd_rub',
    ]);
    assert.equal(PUBLIC_MACRO_PATHS.size, 4);
});
