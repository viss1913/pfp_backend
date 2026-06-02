const { FINAM_REPORT_V2_PAGE_TYPES } = require('../src/reports/finam_v2/finamReportV2Contract');
const { resolveTailPageOrder, isSberProject } = require('../src/reports/finam_v2/finamV2SberPageConfig');
const { buildFinamV2TemplatePackage } = require('../src/reports/finam_v2/finamV2PageComposer');
const { buildV2Model } = require('../src/reports/finam_v2/buildFinamReportV2HtmlPackage');
const { buildTrackedPartnerUrl } = require('../src/utils/trackedPartnerUrl');
const SBER_LIFE_TARIFF = 0.0144;

const SBER = 29;
const FINAM = 14;

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

const sberTail = resolveTailPageOrder(SBER);
assert(isSberProject(SBER), 'isSberProject(29)');
assert(!sberTail.includes(FINAM_REPORT_V2_PAGE_TYPES.COMON_AUTOFOLLOW), 'no comon for sber');
assert(!sberTail.includes(FINAM_REPORT_V2_PAGE_TYPES.IDU_STRATEGIES), 'no idu for sber');
assert(!sberTail.includes(FINAM_REPORT_V2_PAGE_TYPES.FINAM_OFFERS), 'no finam offers for sber');
assert(sberTail.includes(FINAM_REPORT_V2_PAGE_TYPES.SBER_EQUITIES_SHOWCASE), 'equities showcase');
assert(sberTail.includes(FINAM_REPORT_V2_PAGE_TYPES.SBER_BONDS_SHOWCASE), 'bonds showcase');

const finamTail = resolveTailPageOrder(FINAM);
assert(finamTail.includes(FINAM_REPORT_V2_PAGE_TYPES.COMON_AUTOFOLLOW), 'finam keeps comon');

const report = {
    client_info: { full_name: 'Тест Сбер', age: 40, avg_monthly_income: 200000 },
    current_situation: { assets_total: 5000000, liabilities_total: 0, net_worth: 5000000 },
    overall_plan: {
        consolidated_portfolio: {
            total_initial_capital: 1000000,
            total_monthly_replenishment: 50000,
            assets_allocation: [
                { asset_class: 'Акции', percent: 30, value: 300000 },
                { asset_class: 'Облигации', percent: 40, value: 400000 },
            ],
        },
        chart_waterfall: { total_projected: 5000000 },
    },
    goals_detailed: [
        {
            goal_id: 1,
            goal_type: 'LIFE',
            goal_type_id: 4,
            name: 'Защита семьи',
            target_amount: 5000000,
            term_months: 180,
        },
    ],
};

const model = buildV2Model(report, { projectId: SBER });
const pkg = buildFinamV2TemplatePackage({ model, includeCover: false, includeSummary: false });
const types = pkg.pages.map((p) => p.type);
assert(types.includes(FINAM_REPORT_V2_PAGE_TYPES.SBER_EQUITIES_SHOWCASE), 'pkg has equities page');
assert(types.includes(FINAM_REPORT_V2_PAGE_TYPES.SBER_BONDS_SHOWCASE), 'pkg has bonds page');
assert(!types.includes(FINAM_REPORT_V2_PAGE_TYPES.COMON_AUTOFOLLOW), 'pkg no comon');

const eqHtml = pkg.pages.find((p) => p.type === FINAM_REPORT_V2_PAGE_TYPES.SBER_EQUITIES_SHOWCASE)?.html || '';
assert(eqHtml.includes('УК «Первая»'), 'equities uk section');
assert(eqHtml.includes('Сбер Инвестиции'), 'equities sber invest');
assert(eqHtml.includes('first-am.ru/fund'), 'uk link');
assert(eqHtml.includes('sberbank.ru/ru/person/investments'), 'broker link');
assert(eqHtml.includes('Продукт 1'), 'placeholder product');

const lifePage = pkg.pages.find((p) => p.type === FINAM_REPORT_V2_PAGE_TYPES.GOAL_LIFE);
assert(lifePage, 'life goal page present');
assert(!lifePage.html.includes('СК Лучи'), 'life not ATB branded');

const expectedAnnual = Math.round(5000000 * SBER_LIFE_TARIFF * 100) / 100;
assert(expectedAnnual === 72000, 'life tariff 1.44% for 5M');

const podushka = buildTrackedPartnerUrl('https://sberbank-insurance.ru/podushka-bezopasnosti', {
    linkType: 'life',
    agent: { partner_agent_id: 'DEMO-AGENT' },
    projectSettings: {
        partner_link_tracking: {
            enabled: true,
            domain_whitelist: ['sberbank-insurance.ru'],
            agent_id_param: 'agent_id',
            defaults: { utm_source: 'pfp', utm_medium: 'report_pdf' },
        },
    },
});
assert(podushka.includes('agent_id=DEMO-AGENT'), 'podushka tracked url');

console.log('OK smoke-sber-report-v2', {
    tailPages: sberTail.length,
    reportPages: types.length,
    lifeAnnualPremium: expectedAnnual,
});
