const PassiveIncomeCalculator = require('../src/services/calculators/PassiveIncomeCalculator');

async function test() {
    console.log('--- Testing Passive Income Fix ---');

    const mockGoal = {
        id: 'test-goal',
        goal_type_id: 2, // PASSIVE_INCOME
        desired_monthly_income: 100000,
        term_months: 120, // 10 years
        initial_capital: 1000000,
        risk_profile: 'BALANCED'
    };

    const mockPortfolio = {
        id: 1,
        name: 'Test Portfolio',
        riskProfiles: [
            {
                profile_type: 'BALANCED',
                instruments: [
                    { product_id: 1, share_percent: 100, bucket_type: 'INITIAL_CAPITAL' },
                    { product_id: 1, share_percent: 100, bucket_type: 'TOP_UP' }
                ]
            }
        ]
    };

    const mockProduct = {
        id: 1,
        name: 'PDS Growth',
        product_type: 'PDS',
        yields: [
            { term_from_months: 0, term_to_months: 3000, amount_from: 0, amount_to: 1000000000, yield_percent: 15 }
        ]
    };

    const mockContext = {
        settings: {
            inflation_rate_year: 4.0,
            investment_expense_growth_monthly: 0.1
        },
        client: {
            avg_monthly_income: 200000
        },
        repositories: {
            portfolioRepository: {
                findByCriteria: async () => mockPortfolio
            },
            productRepository: {
                findById: async () => mockProduct
            }
        },
        services: {
            settingsService: {
                findPassiveIncomeYieldLine: async () => ({ yield_percent: 12 })
            }
        },
        assets: [],
        usedCofinancingPerYear: {},
        usedTaxBasePerYear: {},
        poolBalance: 0,
        sharedPoolEvents: []
    };

    // Mock handlePdsEvents to avoid DB connection
    PassiveIncomeCalculator.handlePdsEvents = async () => ({ cofin: 0, refund: 0 });

    try {
        const result = await PassiveIncomeCalculator.calculate(mockGoal, mockContext);
        console.log('Result Status:', result.summary.status);
        console.log('Required Capital Future:', result.summary.required_capital_at_end);
        console.log('Accumulation Yield:', result.summary.accumulation_yield_percent);
        console.log('Monthly Replenishment:', result.summary.monthly_replenishment);
        console.log('Tax Benefit:', result.summary.total_tax_benefit);
        console.log('Cofinancing:', result.summary.total_cofinancing);
        console.log('Debug Info:', JSON.stringify(result.summary._debug, null, 2));

        if (result.summary.accumulation_yield_percent === 15 && result.summary.monthly_replenishment > 0) {
            console.log('\n✅ TEST PASSED: Yield correctly identified and replenishment is non-zero.');
        } else {
            console.error('\n❌ TEST FAILED: Yield or replenishment calculation is incorrect.');
        }
    } catch (error) {
        console.error('Test Error:', error);
    }
}

test();
