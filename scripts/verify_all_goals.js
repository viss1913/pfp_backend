const PensionCalculator = require('../src/services/calculators/PensionCalculator');
const PassiveIncomeCalculator = require('../src/services/calculators/PassiveIncomeCalculator');
const InvestmentCalculator = require('../src/services/calculators/InvestmentCalculator');
const OtherGoalCalculator = require('../src/services/calculators/OtherGoalCalculator');
const LifeInsuranceCalculator = require('../src/services/calculators/LifeInsuranceCalculator');
const FinReserveCalculator = require('../src/services/calculators/FinReserveCalculator');
const RentCalculator = require('../src/services/calculators/RentCalculator');

const mockContext = {
    client: {
        id: 1,
        birth_date: '1985-05-15',
        sex: 'male',
        avg_monthly_income: 150000,
        ipk_current: 50,
        ops_capital: 300000
    },
    settings: {
        inflation_rate_year: 5.0,
        pension_point_cost: 133.05,
        pension_fixed_payment: 8134.88,
        investment_expense_growth_monthly: 0.1
    },
    repositories: {
        productRepository: {
            findById: async (id) => ({ id, name: 'Test Product', yields: [{ term_from_months: 0, term_to_months: 1000, yield_percent: 12 }] })
        },
        portfolioRepository: {
            findByCriteria: async (criteria) => ({
                id: criteria.classId,
                name: `Portfolio Class ${criteria.classId}`,
                riskProfiles: [
                    {
                        risk_profile: 'BALANCED',
                        instruments: [{ product_id: 1, share_percent: 100, bucket_type: 'INITIAL_CAPITAL' }]
                    }
                ],
                instruments: [{ name: `Inst Class ${criteria.classId}`, share: 100, yield: 12 }]
            })
        }
    },
    services: {
        settingsService: {
            findPassiveIncomeYieldLine: async () => ({ yield_percent: 10.0 })
        },
        nsjApiService: {
            calculateLifeInsurance: async () => ({
                success: true,
                total_limit: 5000000,
                program: 'Allianz Mock',
                risks: [
                    { risk_name: 'Death', limit_amount: 5000000 }
                ]
            })
        },
        TaxService: {
            calculateNdfl: async () => ({ effectiveRate: 13 }),
            calculateLifeInsuranceDeduction: async () => ({ refundAmount: 15600 })
        }
    },
    sharedPoolEvents: [],
    assets: []
};

async function runTest(calc, goal, name) {
    try {
        console.log(`\n--- TESTING ${name} ---`);
        const result = await calc.calculate(goal, mockContext);
        console.log(JSON.stringify(result, null, 2));
    } catch (e) {
        console.error(`ERROR in ${name}:`, e.message);
    }
}

async function runAll() {
    await runTest(PensionCalculator, { id: 101, goal_type_id: 1, name: 'Pension', target_amount: 100000, initial_capital: 2000000, ops_capital: 500000, inflation_rate: 5.0 }, 'PENSION');

    await runTest(PassiveIncomeCalculator, { id: 102, goal_type_id: 2, name: 'Passive', target_amount: 50000, term_months: 120, initial_capital: 5000000 }, 'PASSIVE INCOME');

    await runTest(InvestmentCalculator, { id: 103, goal_type_id: 3, name: 'Invest', initial_capital: 100000, monthly_replenishment: 10000, term_months: 60 }, 'INVESTMENT');

    await runTest(OtherGoalCalculator, { id: 104, goal_type_id: 4, name: 'House', target_amount: 10000000, term_months: 60, initial_capital: 2000000, risk_profile: 'BALANCED' }, 'OTHER');

    await runTest(LifeInsuranceCalculator, { id: 105, goal_type_id: 5, name: 'Life', target_amount: 5000000, term_months: 120, payment_variant: 12 }, 'LIFE'); // Monthly payment

    await runTest(FinReserveCalculator, { id: 107, goal_type_id: 7, name: 'Reserve', initial_capital: 500000, term_months: 6, monthly_replenishment: 0 }, 'FIN_RESERVE');

    await runTest(RentCalculator, { id: 108, goal_type_id: 8, name: 'Rent', initial_capital: 10000000 }, 'RENT');
}

runAll();
