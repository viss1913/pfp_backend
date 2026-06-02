const assert = require('node:assert/strict');
const test = require('node:test');

const {
    planHasStockInPlan,
    planHasProductTypes,
    shouldIncludeComonShowcaseInReport,
} = require('../src/utils/comonShowcaseGate');
const {
    buildFinamV2TemplatePackage,
    buildFinamV2TemplatePageHtml,
} = require('../src/reports/finam_v2/finamV2PageComposer');
const { FINAM_REPORT_V2_PAGE_TYPES } = require('../src/reports/finam_v2/finamReportV2Contract');

test('planHasStockInPlan detects STOCK in consolidated portfolio', () => {
    assert.equal(planHasStockInPlan(null), false);
    assert.equal(
        planHasStockInPlan({
            consolidated_portfolio: {
                assets_allocation: [{ name: 'ПДС', product_type: 'PDS' }],
                cash_flow_allocation: [],
            },
        }),
        false
    );
    assert.equal(
        planHasStockInPlan({
            consolidated_portfolio: {
                assets_allocation: [{ name: 'Акции', product_type: 'STOCK' }],
                cash_flow_allocation: [{ name: 'Облигации', product_type: 'BOND' }],
            },
        }),
        true
    );
    assert.equal(planHasProductTypes({ consolidated_portfolio: {} }, ['BOND']), false);
});

test('shouldIncludeComonShowcaseInReport requires non-empty items', () => {
    assert.equal(shouldIncludeComonShowcaseInReport(null), false);
    assert.equal(shouldIncludeComonShowcaseInReport({ enabled: false, skip_reason: 'no_stock_in_plan' }), false);
    assert.equal(shouldIncludeComonShowcaseInReport({ enabled: true, items: [] }), false);
    assert.equal(shouldIncludeComonShowcaseInReport({ enabled: true, error: true, items: [] }), false);
    assert.equal(
        shouldIncludeComonShowcaseInReport({
            enabled: true,
            items: [{ id: 1, name: 'Test' }],
        }),
        true
    );
});

test('finam v2 composer skips Comon page without showcase items', () => {
    const pkgEmpty = buildFinamV2TemplatePackage({
        model: {
            goals: [],
            comonShowcase: { enabled: false, skip_reason: 'no_stock_in_plan', items: [] },
        },
        includeCover: false,
        includeSummary: false,
    });
    assert.equal(
        pkgEmpty.pages.some((p) => p.type === FINAM_REPORT_V2_PAGE_TYPES.COMON_AUTOFOLLOW),
        false
    );

    const pkgWithItems = buildFinamV2TemplatePackage({
        model: {
            goals: [],
            comonShowcase: {
                enabled: true,
                items: [{ id: 1, name: 'Alpha', url: 'https://www.comon.ru/strategies/1', min_sum: 10000 }],
            },
        },
        includeCover: false,
        includeSummary: false,
    });
    assert.equal(
        pkgWithItems.pages.some((p) => p.type === FINAM_REPORT_V2_PAGE_TYPES.COMON_AUTOFOLLOW),
        true
    );
});

test('comon v2 page html renders up to six strategy cards', async () => {
    const items = Array.from({ length: 6 }, (_, i) => ({
        id: 1000 + i,
        name: `Strategy ${i + 1}`,
        url: `https://www.comon.ru/strategies/${1000 + i}`,
        min_sum: 50000 + i * 1000,
        profit_365_days_percent: 10 + i,
        author: 'Author',
        description: 'x'.repeat(200),
    }));
    const html = await buildFinamV2TemplatePageHtml({
        model: { comonShowcase: { disclaimer_ru: 'Test disclaimer', items } },
        pageType: FINAM_REPORT_V2_PAGE_TYPES.COMON_AUTOFOLLOW,
    });
    assert.match(html, /Strategy 1/);
    assert.match(html, /Strategy 6/);
    assert.doesNotMatch(html, /Strategy 7/);
    assert.match(html, /finam-v2-comon__card-grid/);
    assert.match(html, /Test disclaimer/);
});
