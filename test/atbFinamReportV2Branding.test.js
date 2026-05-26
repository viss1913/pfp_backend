const assert = require('node:assert/strict');
const test = require('node:test');

const { buildFinamReportV2PageHtml } = require('../src/reports/finam_v2/buildFinamReportV2HtmlPackage');

function buildReport() {
    return {
        client_info: {
            full_name: 'Тестовый Клиент',
            first_name: 'Тестовый',
            avg_monthly_income: 250000,
        },
        current_situation: {},
        overall_plan: {
            pdf_metrics: {
                portfolio: {
                    total_initial_capital: 300000,
                    total_monthly_replenishment: 20000,
                    assets_allocation: [],
                    cash_flow_allocation: [],
                },
            },
        },
        goals_detailed: [
            {
                goal_id: 10,
                goal_type: 'LIFE',
                goal_type_id: 5,
                goal_name: 'Защита семьи',
                summary: {
                    target_coverage: 3000000,
                    target_amount_initial: 3000000,
                    target_amount_future: 3000000,
                    initial_capital: 43200,
                    monthly_replenishment: 3600,
                    premium_frequency: 'monthly',
                    total_tax_benefit: 56160,
                },
                details: {
                    program_name: 'Подушка безопасности · Сбер Страхование Жизни',
                    company_name: 'Сбер Страхование жизни',
                    insurer_name: 'Сбер Страхование жизни',
                    annual_premium: 43200,
                    tax_deduction_2026: 3744,
                    total_tax_deductions: 56160,
                    risks: [
                        { risk_name: 'Уход из жизни по любой причине', limit_amount: 3000000 },
                        { risk_name: 'Инвалидность I-II группы', limit_amount: 3000000 },
                    ],
                },
            },
        ],
    };
}

test('ATB project 3 uses SK Luchi branding in Finam v2 life and risk pages', async () => {
    const lifeHtml = await buildFinamReportV2PageHtml({
        report: buildReport(),
        pageType: 'goal-life',
        projectId: 3,
    });
    const riskHtml = await buildFinamReportV2PageHtml({
        report: buildReport(),
        pageType: 'risk-declaration',
        projectId: 3,
    });

    assert.match(lifeHtml, /СК Лучи/);
    assert.doesNotMatch(lifeHtml, /Сбер Страхование/i);
    assert.doesNotMatch(riskHtml, /Сбер Страхование/i);
});

test('ATB roadmap page swaps LIFE CTA url via runtime branding', async () => {
    const prev = process.env.ATB_LIFE_OFFER_URL;
    process.env.ATB_LIFE_OFFER_URL = 'https://atb.example/life';
    try {
        const roadmapHtml = await buildFinamReportV2PageHtml({
            report: buildReport(),
            pageType: 'roadmap',
            projectId: 3,
        });
        assert.match(roadmapHtml, /https:\/\/atb\.example\/life/);
        assert.doesNotMatch(roadmapHtml, /sberbank-insurance\.ru\/podushka-bezopasnosti/);
    } finally {
        if (prev !== undefined) process.env.ATB_LIFE_OFFER_URL = prev;
        else delete process.env.ATB_LIFE_OFFER_URL;
    }
});
