const test = require('node:test');
const assert = require('node:assert/strict');
const {
    parseGoalsSummary,
    aggregateGoalsSummaryMetrics,
    aggregateClientsMetrics,
    buildNetworkSummary,
} = require('../../src/utils/goalsSummaryMetrics');

const fixture = {
    calculation: {
        goals: [
            {
                goal_type: 'LIFE',
                goal_type_id: 5,
                term_months: 120,
                details: {
                    annual_premium: 100000,
                    nsj_calculation: { total_premium: 1000000 },
                },
            },
            {
                goal_type: 'INVESTMENT',
                goal_type_id: 3,
                term_months: 60,
                summary: { initial_capital: 5000000 },
            },
        ],
    },
};

test('parseGoalsSummary reads calculation.goals', () => {
    const p = parseGoalsSummary(fixture);
    assert.equal(p.goals.length, 2);
});

test('aggregateGoalsSummaryMetrics sums LIFE and investment', () => {
    const m = aggregateGoalsSummaryMetrics(fixture);
    assert.equal(m.has_plan, true);
    assert.equal(m.has_life_goal, true);
    assert.equal(m.nsj_annual_premium_rub, 100000);
    assert.equal(m.nsj_contract_premium_rub, 1000000);
    assert.equal(m.investment_capital_rub, 5000000);
    assert.equal(m.term_months_list.length, 2);
});

test('aggregateClientsMetrics rolls up clients and crm', () => {
    const clients = [
        {
            crm_status: 'BOUGHT',
            goals_summary: fixture,
            updated_at: '2026-05-10T10:00:00Z',
        },
        {
            crm_status: 'THINKING',
            goals_summary: null,
            created_at: '2026-05-01T08:00:00Z',
        },
    ];
    const m = aggregateClientsMetrics(clients);
    assert.equal(m.clients_count, 2);
    assert.equal(m.clients_with_plan_count, 1);
    assert.equal(m.nsj_clients_count, 1);
    assert.equal(m.crm.BOUGHT, 1);
    assert.equal(m.crm.THINKING, 1);
    assert.ok(m.last_client_at);
});

test('buildNetworkSummary aggregates subagent rows', () => {
    const rows = [
        {
            metrics: {
                clients_count: 2,
                clients_with_plan_count: 1,
                nsj_annual_premium_rub: 100,
                nsj_contract_premium_rub: 200,
                nsj_clients_count: 1,
                investment_capital_rub: 300,
                avg_term_months: 90,
            },
        },
        {
            metrics: {
                clients_count: 1,
                clients_with_plan_count: 1,
                nsj_annual_premium_rub: 50,
                nsj_contract_premium_rub: 100,
                nsj_clients_count: 1,
                investment_capital_rub: 200,
                avg_term_months: 60,
            },
        },
    ];
    const s = buildNetworkSummary(rows);
    assert.equal(s.subagents_count, 2);
    assert.equal(s.clients_count, 3);
    assert.equal(s.nsj_annual_premium_rub, 150);
    assert.equal(s.investment_capital_rub, 500);
    assert.equal(s.avg_term_months, 75);
});
