const test = require('node:test');
const assert = require('node:assert/strict');
const {
    EXECUTIVE_SCENARIO_THRESHOLDS,
    pickExecutiveScenarioKey,
    buildExecutiveDecisionContent,
    enrichExecutiveNarrativeWithIfus,
} = require('../src/reports/finam_v2/executiveScenarioCatalog');
const { buildIfusFromReportModel } = require('../src/reports/finam_v2/ifusExecutiveModel');

const fmtMoney = (n) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;
const fmtPct = (n) => `${Number(n).toFixed(1)}%`;

function goalsDiag(over = {}) {
    return {
        hasReserve: true,
        hasLife: true,
        hasPension: false,
        goalLoadRatio: 0.1,
        largestGoal: { title: 'Пенсия' },
        largestGroup: { id: 'invest', title: 'Инвестиции', percent: 30 },
        ...over,
    };
}

function cashDiag(over = {}) {
    return {
        income: 200000,
        obligations: 80000,
        plannedContributions: 20000,
        freeCashflow: 100000,
        freeCashflowRatio: 0.5,
        goalLoadRatio: 0.1,
        ...over,
    };
}

test('scenario: negative cashflow has top priority', () => {
    const key = pickExecutiveScenarioKey({
        cashflowDiagnostics: cashDiag({ freeCashflow: -15000, freeCashflowRatio: -0.15 }),
        goalsDiagnostics: goalsDiag({ hasReserve: false, hasLife: false }),
    });
    assert.equal(key, 'cashflow_negative');
});

test('scenario: goal overload when load >= 45%', () => {
    const key = pickExecutiveScenarioKey({
        cashflowDiagnostics: cashDiag({ freeCashflow: 50000, freeCashflowRatio: 0.25 }),
        goalsDiagnostics: goalsDiag({ goalLoadRatio: 0.48 }),
    });
    assert.equal(key, 'goal_overload');
});

test('scenario: protection gap without reserve or LIFE with obligations', () => {
    assert.equal(
        pickExecutiveScenarioKey({
            cashflowDiagnostics: cashDiag({ obligations: 50000 }),
            goalsDiagnostics: goalsDiag({ hasReserve: false, hasLife: true }),
        }),
        'protection_gap'
    );
    assert.equal(
        pickExecutiveScenarioKey({
            cashflowDiagnostics: cashDiag({ obligations: 30000 }),
            goalsDiagnostics: goalsDiag({ hasReserve: true, hasLife: false }),
        }),
        'protection_gap'
    );
});

test('scenario: growth_ready when free ratio >= 30%', () => {
    const key = pickExecutiveScenarioKey({
        cashflowDiagnostics: cashDiag({ freeCashflowRatio: 0.35 }),
        goalsDiagnostics: goalsDiag(),
    });
    assert.equal(key, 'growth_ready');
});

test('buildExecutiveDecisionContent returns 7-scenario catalog fields', () => {
    const decision = buildExecutiveDecisionContent({
        cashflowDiagnostics: cashDiag(),
        goalsDiagnostics: goalsDiag(),
        portfolio: { projectedTotal: 50e6 },
        formatMoney: fmtMoney,
        formatPercent: fmtPct,
    });
    assert.equal(decision.scenario, 'growth_ready');
    assert.ok(decision.headline);
    assert.equal(decision.cards.length, 3);
    assert.equal(decision.decisionRows.length, 3);
    assert.deepEqual(decision.thresholds, { ...EXECUTIVE_SCENARIO_THRESHOLDS });
});

test('enrichExecutiveNarrativeWithIfus appends IFUS once', () => {
    const ifus = { totalScoreFormatted: '7,2', band: { label: 'Высокая устойчивость' } };
    const a = enrichExecutiveNarrativeWithIfus({ keyInsight: 'Базовый вывод.' }, ifus);
    assert.match(a.keyInsight, /ИФУС семьи: 7,2/);
    const b = enrichExecutiveNarrativeWithIfus(a, ifus);
    assert.equal((b.keyInsight.match(/ИФУС семьи/g) || []).length, 1);
});

/** QA-профили «как у реального клиента» (фикстуры snapshot + v2). */
const QA_PROFILES = [
    {
        name: 'stable_family',
        expectScenario: 'growth_ready',
        minIfus: 6,
        report: {
            family_page_ai_context: {
                family: { children: [], family_obligations: [{ type: 'loans', amount_monthly: 12000 }] },
                cashflow_monthly_rub: {},
            },
            current_situation: { net_worth: 6e6, liabilities_total: 500000, assets_breakdown: [{ name: 'Депозит', value: 900000 }] },
        },
        v2: {
            goals: [
                { goal_type: 'FIN_RESERVE', summary: { initial_capital: 900000 }, initial_capital: 900000 },
                { goal_type: 'LIFE', target_amount: 12e6 },
            ],
            cashflowDiagnostics: cashDiag(),
            goalsDiagnostics: goalsDiag(),
            currentState: { netWorth: 6e6, liabilitiesTotal: 500000, assetsBreakdown: [], obligations: 80000 },
            portfolio: { projectedTotal: 40e6 },
        },
    },
    {
        name: 'no_life_with_children',
        expectScenario: 'protection_gap',
        maxIfus: 8,
        expectPenalty: 'life_missing_children',
        report: {
            family_page_ai_context: {
                family: {
                    children: [{ first_name: 'М', birth_date: '2016-05-01' }],
                    family_obligations: [{ type: 'rent', amount_monthly: 45000 }],
                },
                cashflow_monthly_rub: {},
            },
            current_situation: { net_worth: 2e6, liabilities_total: 0, assets_breakdown: [] },
        },
        v2: {
            goals: [],
            cashflowDiagnostics: cashDiag({
                income: 180000,
                obligations: 70000,
                plannedContributions: 25000,
                freeCashflow: 85000,
                freeCashflowRatio: 85000 / 180000,
            }),
            goalsDiagnostics: goalsDiag({ hasReserve: false, hasLife: false }),
            currentState: { netWorth: 2e6, obligations: 70000 },
            portfolio: { projectedTotal: 15e6 },
        },
    },
    {
        name: 'negative_cashflow',
        expectScenario: 'cashflow_negative',
        expectPenalty: 'scf_negative',
        report: {
            family_page_ai_context: { family: { children: [], family_obligations: [] }, cashflow_monthly_rub: {} },
            current_situation: {},
        },
        v2: {
            goals: [],
            cashflowDiagnostics: cashDiag({
                income: 120000,
                obligations: 50000,
                plannedContributions: 90000,
                freeCashflow: -20000,
                freeCashflowRatio: -20000 / 120000,
                goalLoadRatio: 0.75,
            }),
            goalsDiagnostics: goalsDiag({ hasReserve: false, hasLife: false, goalLoadRatio: 0.75 }),
            currentState: {},
            portfolio: { projectedTotal: 8e6 },
        },
    },
];

for (const profile of QA_PROFILES) {
    test(`QA profile ${profile.name}: scenario + IFUS`, () => {
        const scenario = pickExecutiveScenarioKey({
            cashflowDiagnostics: profile.v2.cashflowDiagnostics,
            goalsDiagnostics: profile.v2.goalsDiagnostics,
        });
        assert.equal(scenario, profile.expectScenario);

        const ifus = buildIfusFromReportModel({ report: profile.report, v2: profile.v2 });
        if (profile.minIfus != null) assert.ok(ifus.totalScore >= profile.minIfus);
        if (profile.maxIfus != null) assert.ok(ifus.totalScore <= profile.maxIfus);
        if (profile.expectPenalty) {
            assert.ok(ifus.penalties.some((p) => p.code === profile.expectPenalty));
        }
        assert.equal(ifus.factors.length, 7);
    });
}
