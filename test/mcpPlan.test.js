const test = require('node:test');
const assert = require('node:assert/strict');
const { MCP_GOAL_CATALOG } = require('../src/mcp/goalCatalog');
const { buildMcpPlanRequest } = require('../src/mcp/buildMcpPlanRequest');
const { presentPlan } = require('../src/mcp/presentPlan');
const { buildMcpPdfUrl } = require('../src/mcp/pdfLink');

const READY = {
    birth_date: '1988-04-12',
    sex: 'женский',
    monthly_income: 200000,
    monthly_expenses: 80000,
    liquid_capital: 1000000,
    has_children: true,
    children_birth_years: [2016],
    risk_profile: 'сбалансированный',
    goals: [
        { code: 'reserve', reserve_months: 6 },
        { code: 'life', coverage: 3000000 },
        { code: 'purchase', name: 'Квартира', target_amount: 8000000, term_years: 7 },
    ],
};

test('catalog tells the model about children, reserve, life and risk', () => {
    const text = JSON.stringify(MCP_GOAL_CATALOG);
    assert.match(text, /Финансовый резерв/);
    assert.match(text, /Защита жизни/);
    assert.ok(MCP_GOAL_CATALOG.some((goal) => goal.code === 'pension'));
});

test('missing children question stops the calculation', () => {
    const { has_children, ...rest } = READY;
    const result = buildMcpPlanRequest(rest, 2);
    assert.equal(result.ok, false);
    assert.match(result.ask_next.join(' '), /дети/i);
});

test('reserve is six months of expenses and life coverage is kept', () => {
    const result = buildMcpPlanRequest(READY, 2);
    assert.equal(result.ok, true);
    const reserve = result.body.goals.find((goal) => goal.goal_type_id === 7);
    const life = result.body.goals.find((goal) => goal.goal_type_id === 5);
    const flat = result.body.goals.find((goal) => goal.goal_type_id === 4);
    assert.equal(reserve.target_amount, 480000);
    assert.equal(life.target_amount, 3000000);
    assert.equal(life.term_months, undefined);
    assert.equal(flat.term_months, 84);
    assert.equal(flat.risk_profile, 'BALANCED');
    assert.equal(reserve.risk_profile, undefined);
    assert.equal(result.body.client.family_profile.children.length, 1);
    assert.equal(result.body.expenses[0].amount, 80000);
    assert.equal(result.body.client.total_liquid_capital, 1000000);
});

test('presentation exposes life premium and forbids invented numbers', () => {
    const brief = presentPlan({
        goals: [{
            goal_name: 'Добра наживешь',
            goal_type: 'LIFE',
            goal_type_id: 5,
            summary: {
                target_coverage: 3000000,
                target_months: 240,
                initial_capital: 125000,
                premium_frequency: 'annual',
            },
            details: {
                program_name: 'Добра наживешь',
                annual_premium: 125000,
                risks: [{ risk_name: 'Дожитие', limit_amount: 3000000 }],
            },
        }],
        summary: { consolidated_portfolio: { total_initial_capital: 125000, total_monthly_replenishment: 0 } },
    }, READY);

    assert.match(brief.instructions.join(' '), /не округляй|не подставляй|только числа/);
    assert.equal(brief.goals[0].life.annual_premium, 125000);
    assert.equal(brief.goals[0].life.tariff_percent, 4.17);
    assert.equal(brief.goals[0].term_years, 20);
    assert.equal(brief.goals[0].monthly_schedule, undefined);
});

test('simple plan asks only for goals, cost, term and capital', () => {
    const result = buildMcpPlanRequest({
        simple: true,
        session_id: 'pfp_simple_6d2b9e41',
        liquid_capital: 500000,
        goals: [
            { code: 'pension', target_amount: 80000 },
            { code: 'purchase', name: 'Квартира', target_amount: 6000000, term_years: 5 },
        ],
    }, 2);
    assert.equal(result.ok, true);
    assert.equal(result.body.client.uuid, 'pfp_simple_6d2b9e41');
    assert.equal(result.body.goals.find((goal) => goal.goal_type_id === 4).risk_profile, 'BALANCED');
    assert.equal(result.body.goals.find((goal) => goal.goal_type_id === 1).target_amount, 80000);
    assert.equal(result.body.goals.find((goal) => goal.goal_type_id === 1).term_months, undefined);
    assert.equal(result.body.client.total_liquid_capital, 500000);
});

test('pdf link is absolute and does not need the project key', () => {
    const url = buildMcpPdfUrl('abc', 'https://pfp.avinfors.ru/api');
    assert.equal(url, 'https://pfp.avinfors.ru/api/client/mcp/pdf?t=abc');
});
