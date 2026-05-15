const test = require('node:test');
const assert = require('node:assert/strict');
const { buildIfusFromReportModel } = require('../src/reports/finam_v2/ifusExecutiveModel');

function baseV2(over = {}) {
    return {
        goals: [],
        cashflowDiagnostics: {
            income: 200000,
            obligations: 80000,
            plannedContributions: 20000,
            freeCashflow: 100000,
            freeCashflowRatio: 0.5,
            goalLoadRatio: 0.1,
            scenario: 'cashflow_strong',
        },
        goalsDiagnostics: {
            hasReserve: true,
            hasLife: true,
            goalLoadRatio: 0.1,
        },
        currentState: {
            netWorth: 5000000,
            liabilitiesTotal: 1000000,
            assetsBreakdown: [{ name: 'Депозит', value: 1200000 }],
            obligations: 80000,
        },
        portfolio: { projectedTotal: 50e6 },
        ...over,
    };
}

test('IFUS: high reserve and low DSR give strong total', () => {
    const lifeGoal = {
        goal_type: 'LIFE',
        goal_type_id: 5,
        target_amount: 15e6,
        summary: {},
    };
    const reserveGoal = {
        goal_type: 'FIN_RESERVE',
        goal_type_id: 7,
        summary: { initial_capital: 800000 },
        initial_capital: 800000,
    };
    const report = {
        family_page_ai_context: {
            family: { children: [], family_obligations: [{ type: 'loans', amount_monthly: 15000 }] },
            cashflow_monthly_rub: { income_spouse_included: 0 },
        },
        current_situation: { liabilities_total: 800000, net_worth: 5e6, assets_breakdown: [] },
    };
    const ifus = buildIfusFromReportModel({
        report,
        v2: baseV2({
            goals: [reserveGoal, lifeGoal],
            cashflowDiagnostics: {
                income: 200000,
                obligations: 80000,
                plannedContributions: 20000,
                freeCashflow: 100000,
                freeCashflowRatio: 0.5,
                goalLoadRatio: 0.1,
                scenario: 'cashflow_strong',
            },
        }),
    });
    assert.ok(ifus.totalScore >= 6);
    assert.equal(ifus.hasLifeGoal, true);
    assert.ok(ifus.factors.length === 7);
});

test('IFUS: no LIFE and children triggers penalty and alert', () => {
    const report = {
        family_page_ai_context: {
            family: {
                children: [{ first_name: 'А', birth_date: '2015-01-01' }],
                family_obligations: [],
            },
            cashflow_monthly_rub: { income_spouse_included: 0 },
        },
        current_situation: {},
    };
    const ifus = buildIfusFromReportModel({
        report,
        v2: baseV2({ goals: [] }),
    });
    const pen = ifus.penalties.find((p) => p.code === 'life_missing_children');
    assert.ok(pen);
    assert.ok(ifus.alerts.some((a) => a.level === 'danger'));
});

test('IFUS: negative free cashflow applies SCF penalty', () => {
    const report = { family_page_ai_context: { family: { children: [], family_obligations: [] }, cashflow_monthly_rub: {} }, current_situation: {} };
    const ifus = buildIfusFromReportModel({
        report,
        v2: baseV2({
            cashflowDiagnostics: {
                income: 100000,
                obligations: 40000,
                plannedContributions: 80000,
                freeCashflow: -20000,
                freeCashflowRatio: -0.2,
                goalLoadRatio: 0.8,
                scenario: 'cashflow_negative',
            },
        }),
    });
    assert.ok(ifus.penalties.some((p) => p.code === 'scf_negative'));
    assert.ok(ifus.totalScore <= 8);
});

test('IFUS factor weights sum to 1', () => {
    const { WEIGHTS } = require('../src/reports/finam_v2/ifusExecutiveModel');
    const s = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(s - 1) < 1e-9);
});

test('IFUS: reserve without LIFE and pension is capped below 5', () => {
    const reserveGoal = {
        goal_type: 'FIN_RESERVE',
        goal_type_id: 7,
        summary: { initial_capital: 1200000 },
        initial_capital: 1200000,
    };
    const report = {
        family_page_ai_context: {
            family: { children: [], family_obligations: [{ type: 'loans', amount_monthly: 10000 }] },
            cashflow_monthly_rub: {},
        },
        current_situation: { net_worth: 5e6, liabilities_total: 300000, assets_breakdown: [{ name: 'Депозит', value: 1200000 }] },
    };
    const ifus = buildIfusFromReportModel({
        report,
        v2: baseV2({
            goals: [reserveGoal],
            goalsDiagnostics: {
                hasReserve: true,
                hasLife: false,
                hasPension: false,
                goalLoadRatio: 0.1,
            },
            cashflowDiagnostics: {
                income: 200000,
                obligations: 80000,
                plannedContributions: 20000,
                freeCashflow: 100000,
                freeCashflowRatio: 0.5,
                goalLoadRatio: 0.1,
            },
        }),
    });
    assert.ok(ifus.totalScore <= 4.5, `expected cap ~4.2, got ${ifus.totalScore}`);
    assert.ok(ifus.penalties.some((p) => p.code === 'protection_contour_cap' || p.code === 'life_missing'));
    assert.equal(ifus.band.id, 'unstable');
});

test('IFUS exports field mapping and data checklist for support', () => {
    const { IFUS_FIELD_MAPPING, IFUS_DATA_CHECKLIST } = require('../src/reports/finam_v2/ifusExecutiveModel');
    assert.ok(IFUS_FIELD_MAPPING.length >= 7);
    assert.ok(IFUS_DATA_CHECKLIST.some((row) => row.id === 'income' && row.required));
    assert.ok(IFUS_DATA_CHECKLIST.some((row) => row.id === 'life'));
});
