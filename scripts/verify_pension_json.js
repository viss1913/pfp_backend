const PensionCalculator = require('../src/services/calculators/PensionCalculator');
const ClientRepository = require('../src/repositories/clientRepository');
const ProductRepository = require('../src/repositories/productRepository');
const PortfolioRepository = require('../src/repositories/portfolioRepository');

// Mock context services and repositories
const mockContext = {
    client: {
        id: 1,
        birth_date: '1985-05-15',
        sex: 'male',
        avg_monthly_income: 150000,
        ipk_current: 50,
        ops_capital: 300000 // Client OPS
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
            findByCriteria: async () => ({
                id: 1,
                name: 'Pension Strategy',
                riskProfiles: [
                    {
                        risk_profile: 'BALANCED',
                        instruments: [{ product_id: 1, share_percent: 100, bucket_type: 'INITIAL_CAPITAL' }]
                    }
                ]
            })
        }
    },
    services: {
        settingsService: {
            findPassiveIncomeYieldLine: async () => ({ yield_percent: 10.0 })
        }
    },
    sharedPoolEvents: []
};

const mockGoal = {
    id: 101,
    goal_type_id: 1,
    name: 'My Pension',
    target_amount: 100000, // Desired Pension
    initial_capital: 2000000, // Own Money
    ops_capital: 500000, // Goal OPS (overrides client)
    inflation_rate: 5.0
};

async function run() {
    try {
        console.log('Running PensionCalculator...');
        const result = await PensionCalculator.calculate(mockGoal, mockContext);
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('Error:', error);
    }
}

run();
