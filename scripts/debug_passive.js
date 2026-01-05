const passiveCalc = require('../src/services/calculators/PassiveIncomeCalculator');
const calculationService = require('../src/services/CalculationService');
const portfolioRepository = require('../src/repositories/portfolioRepository');

// Mock context
const context = {
    settings: {
        investment_expense_growth_monthly: 0.1,
        inflation_rate_year: 4
    },
    client: {
        avg_monthly_income: 1000000
    },
    repositories: {
        portfolioRepository: {
            findByCriteria: async () => ({
                id: 1,
                name: "Mock Portfolio",
                instruments: [{ name: "StoNkS", share: 100, yield: 12 }]
            }),
            findById: async () => null
        }
    },
    services: {
        settingsService: {
            findPassiveIncomeYieldLine: async () => ({ yield_percent: 12 })
        }
    },
    assets: [],
    sharedPoolEvents: [{ month: 0, amount: 500000 }], // Initial pool
    poolBalance: 500000
};

// Mock Deduct (BaseCalc method uses context, but we are running instance)
// We need to initialize the calculator correctly or mock BaseCalculator methods?
// No, we use the real instance.

async function run() {
    const goal = {
        goal_type_id: 2,
        name: "Passive Income Test",
        initial_capital: 500000,
        target_amount: 300000, // Monthly income
        term_months: 180,
        inflation_rate: 4
    };

    console.log("--- Running Passive Income Calc Debug ---");
    try {
        const result = await passiveCalc.calculate(goal, context);
        console.log("Result:", JSON.stringify(result, null, 2));
    } catch (e) {
        console.error(e);
    }
}

run();
