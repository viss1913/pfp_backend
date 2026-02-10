const PassiveIncomeCalculator = require('../src/services/calculators/PassiveIncomeCalculator');

// Mock Context with realistic defaults
const context = {
    client: { avg_monthly_income: 150000, birth_date: '1985-01-01', sex: 'male' },
    settings: {
        inflation_rate_year: 4.0,
        investment_expense_growth_monthly: 0.1, // Monthly indexation
        pension_max_salary_limit: 2759000
    },
    repositories: {
        portfolioRepository: {
            findByCriteria: async () => ({
                id: 1,
                name: 'Test Portfolio',
                yield_percent: 12.0
            })
        }
    },
    services: {
        settingsService: {
            findPassiveIncomeYieldLine: async () => ({
                yield_percent: 5.0 // Conservative payout yield
            }),
            calculatePdsCofinancing: async () => ({ state_cofin_amount: 0 })
        }
    },
    assets: [],
    sharedPoolEvents: [], // Empty shared pool for this test
    usedCofinancingPerYear: {},
    usedTaxBasePerYear: {}
};

// Goal Parameters from Screenshot
const goal = {
    id: 'goal-passive',
    goal_type_id: 2,
    goal_type: 'PASSIVE_INCOME',
    name: 'Пассивный доход',
    desired_monthly_income: 265000, // User input
    term_months: 168, // Feb 2026 to Feb 2040 (approx 14 years)
    inflation_rate: 4.0,
    initial_capital: 500000, // "Первонач. капитал" from screenshot
    smart_initial_capital: 100000, // Assuming 100k available from pool ("Всего 100 тыс.") - let's check impact
    // If user manually set 500k, that implies external assets or previous accumulation?
    // Screenshot shows "Накоплено (Сейчас) 400 000" on Fin Reserve, and "Всего 526,3 тыс." total capital pie chart?
    // Let's assume passed initial_capital is 500k (from some source) and see if replenishment calculates.
};

async function runTest() {
    console.log("--- Reproducing User Scenario (V2) ---");
    console.log("Goal:", JSON.stringify(goal, null, 2));

    try {
        const result = await PassiveIncomeCalculator.calculate(goal, context);
        console.log("\nResult Summary:", JSON.stringify(result.summary, null, 2));

        if (result.summary.monthly_replenishment > 0) {
            console.log("\nSUCCESS: Calculated replenishment:", result.summary.monthly_replenishment);
        } else {
            console.error("\nFAIL: Monthly replenishment is 0!");
        }

    } catch (e) {
        console.error("ERROR:", e);
    }
}

runTest();
