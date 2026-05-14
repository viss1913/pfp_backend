const assert = require('node:assert/strict');
const test = require('node:test');

const {
    buildFinamReportV2HtmlPackage,
    buildFinamReportV2PageHtml,
} = require('../src/reports/finam_v2/buildFinamReportV2HtmlPackage');
const { FINAM_REPORT_V2_PAGE_TYPES } = require('../src/reports/finam_v2/finamReportV2Contract');

/** Как `toMonthStartIso` в `buildFinamReportHtml.js` — локальный календарь, без UTC-сдвига `toISOString()`. */
function monthDate(offset = 0) {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}-01`;
}

function schedule(initial, monthly, months) {
    return Array.from({ length: months }, (_, idx) => ({
        date: monthDate(idx),
        replenishment: idx === 0 ? initial : monthly,
        tax_deduction: idx === 4 ? 12000 : 0,
        cofinancing: idx >= 1 ? 3000 : 0,
        total_capital: initial + monthly * idx + (idx >= 1 ? 3000 * idx : 0),
        schedule_row_kind: idx === 0 ? 'INITIAL_LUMP' : 'MONTHLY',
    }));
}

test('Finam v2 tail pages use report data instead of demo static values', async () => {
    const report = {
        client_info: {
            full_name: 'Тестовый Клиент',
            first_name: 'Тестовый',
        },
        current_situation: {},
        overall_plan: {
            tax_benefits: {
                pds_benefits: { deduction_2026: 30000, total_deductions: 300000, cofinancing_2026: 12000 },
                iis_benefits: { deduction_2026: 20000, total_deductions: 250000 },
                nsj_benefits: { deduction_2026: 10000, total_deductions: 100000 },
                children_benefits: { deduction_2026: 5000, total_deductions: 50000 },
                totals: {
                    deduction_2026: 65000,
                    cofinancing_2026: 12000,
                    total_deductions: 700000,
                    total_cofinancing: 144000,
                    total_state_benefits: 844000,
                },
            },
            pdf_metrics: {
                portfolio: {
                    total_initial_capital: 300000,
                    total_monthly_replenishment: 25000,
                    assets_allocation: [{ assetClass: 'Облигации', percent: 100, amount: 300000 }],
                    cash_flow_allocation: [{ assetClass: 'Облигации', percent: 100, amount: 25000 }],
                },
            },
        },
        summary: { total_capital: 2500000 },
        comon_showcase: {
            disclaimer_ru: 'Comon дисклеймер из отчёта.',
            items: [
                {
                    name: 'Real Comon Alpha',
                    url: 'https://comon.ru/strategy/alpha',
                    min_sum: 150000,
                    risk_level: 'medium',
                    profit_365_days_percent: 21.4,
                    follower_count: 321,
                    strategy_rating: 4.8,
                    author: 'Finam',
                },
            ],
        },
        goals_detailed: [
            {
                goal_id: 1,
                goal_type: 'PENSION',
                goal_type_id: 1,
                goal_name: 'Пенсия',
                summary: {
                    initial_capital: 100000,
                    monthly_replenishment: 10000,
                    target_months: 24,
                    projected_capital_at_retirement: 900000,
                },
                details: { monthly_schedule: schedule(100000, 10000, 16) },
            },
            {
                goal_id: 2,
                goal_type: 'INVESTMENT',
                goal_type_id: 3,
                goal_name: 'Сохранить и приумножить',
                summary: {
                    initial_capital: 200000,
                    monthly_replenishment: 15000,
                    target_months: 24,
                    projected_capital_at_end: 1600000,
                },
                details: { monthly_schedule: schedule(200000, 15000, 16) },
            },
            {
                goal_id: 3,
                goal_type: 'LIFE',
                goal_type_id: 5,
                goal_name: 'Защита жизни',
                summary: {
                    initial_capital: 999999,
                    monthly_replenishment: 9999,
                    target_coverage: 2000000,
                },
                details: { monthly_schedule: schedule(999999, 9999, 16) },
            },
        ],
    };

    const macroData = {
        cpiYoySeries: [
            { date: '2025-01-01', value: 7.1 },
            { date: '2026-01-01', value: 8.1 },
        ],
        keyRateSeries: [
            { date: '2025-01-01', value: 16 },
            { date: '2026-01-01', value: 17.5 },
        ],
        ofz2Series: [{ date: '2026-01-01', value: 14.1 }],
        ofz5Series: [{ date: '2026-01-01', value: 13.7 }],
        ofz10Series: [{ date: '2026-01-01', value: 13.2 }],
        corpIndexSeries: [{ date: '2026-01-01', value: 15.3 }],
    };

    const pkg = await buildFinamReportV2HtmlPackage({
        report,
        includeCover: false,
        includeSummary: false,
        macroData,
    });

    const pageHtml = (type) => pkg.pages.find((page) => page.type === type)?.html || '';
    const taxHtml = pageHtml(FINAM_REPORT_V2_PAGE_TYPES.TAX_PLANNING);
    const comonHtml = pageHtml(FINAM_REPORT_V2_PAGE_TYPES.COMON_AUTOFOLLOW);
    const inflationHtml = pageHtml(FINAM_REPORT_V2_PAGE_TYPES.INFLATION);
    const detailedHtml = pageHtml(FINAM_REPORT_V2_PAGE_TYPES.DETAILED_PLAN);

    assert.match(taxHtml, /65(?:&nbsp;|\s)тыс\.(?:&nbsp;|\s)₽/);
    assert.doesNotMatch(taxHtml, /77 тыс ₽/);

    assert.match(comonHtml, /Real Comon Alpha/);
    assert.match(comonHtml, /Comon дисклеймер из отчёта/);
    assert.doesNotMatch(comonHtml, /Умеренная стратегия/);

    assert.match(inflationHtml, /8,1%/);
    assert.match(inflationHtml, /17,5%/);
    assert.doesNotMatch(inflationHtml, /7,8%/);
    assert.doesNotMatch(inflationHtml, /пример/);

    assert.match(detailedHtml, /300(?:&nbsp;|\s)000(?:&nbsp;|\s)₽/);
    assert.match(detailedHtml, /25(?:&nbsp;|\s)000(?:&nbsp;|\s)₽/);
    assert.doesNotMatch(detailedHtml, /999(?:&nbsp;|\s)999/);
    assert.doesNotMatch(detailedHtml, /Следующий год/);

    const singleInflationHtml = await buildFinamReportV2PageHtml({
        report,
        pageType: 'inflation',
        macroData,
    });
    assert.match(singleInflationHtml, /8,1%/);

    const singleComonHtml = await buildFinamReportV2PageHtml({
        report,
        pageType: 'comon-autofollow',
    });
    assert.match(singleComonHtml, /Real Comon Alpha/);

    const singleDetailedHtml = await buildFinamReportV2PageHtml({
        report,
        pageType: 'detailed-plan',
    });
    assert.match(singleDetailedHtml, /300(?:&nbsp;|\s)000(?:&nbsp;|\s)₽/);
});
