const PensionCalculator = require('../src/services/calculators/PensionCalculator');

// MOCK DEPENDENCIES
const mockContext = {
    client: {
        birth_date: '1990-01-01', // 36 years old
        sex: 'male',
        avg_monthly_income: 100000,
        ipk_current: 50
    },
    settings: {
        inflation_rate: 5.6,
        pension_point_cost: 133,
        pension_fixed_payment: 8134,
        pension_pfr_contribution_rate_part1: 22,
        pension_max_salary_limit: 1917000,
        investment_expense_growth_monthly: 0
    },
    services: {
        TaxService: {
            calculateNdfl: () => ({ effectiveRate: 13 })
        }
    },
    repositories: {
        productRepository: {
            findById: async (id) => ({
                id,
                product_type: 'PDS',
                name: 'PDS Fund',
                yields: [{ term_from_months: 0, term_to_months: 1000, amount_from: 0, amount_to: 1e9, yield_percent: 15 }]
            })
        },
        portfolioRepository: {
            findByCriteria: async () => ({
                id: 1,
                riskProfiles: [
                    {
                        risk_profile: 'BALANCED',
                        instruments: [{ product_id: 101, share_percent: 100, bucket_type: 'INITIAL_CAPITAL' }]
                    }
                ]
            })
        }
    },
    usedCofinancingPerYear: {},
    usedTaxBasePerYear: {}
};

// Mock settingsService required by BaseCalculator
const settingsService = require('../src/services/settingsService');
settingsService.calculatePdsCofinancing = async (contrib) => ({
    state_cofin_amount: Math.min(contrib, 36000),
    cofin_coef: 1,
    bracket_id: 1
});

async function run() {
    console.log('--- Debugging PDS Breakdown ---');

    const goal = {
        id: 1,
        goal_type_id: 1,
        name: 'Pension',
        target_amount: 100000,
        risk_profile: 'BALANCED',
        initial_capital: 100000,
        monthly_replenishment: 5000
    };

    try {
        const result = await PensionCalculator.calculate(goal, mockContext);

        console.log('Summary:', result.summary);

        if (result.details && result.details.yearly_breakdown) {
            console.log('\nYearly Breakdown (First 5 years):');
            const breakdown = result.details.yearly_breakdown;
            breakdown.slice(0, 5).forEach(y => {
                console.log(`Year ${y.year}: Refund=${y.tax_refund_projected}, Cofin=${y.cofinancing_for_year}`);
            });

            // Specific check for 2027 (benefits from 2026)
            const year2027 = breakdown.find(y => y.year === 2027);
            console.log('\n2027 Entry:', year2027);
        } else {
            console.log('No yearly_breakdown found!');
        }

    } catch (err) {
        console.error('Error:', err);
    }
}

run();
