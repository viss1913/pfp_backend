const fs = require('fs');
const path = require('path');

// --- MOCKS ---
// We must mock these BEFORE requiring calculationService because it requires them.
// Since node modules are cached, we require them first and patch their methods.

const settingsService = require('../src/services/settingsService');
settingsService.get = async (key) => {
    const defaults = {
        'investment_expense_growth_monthly': 0.0,
        'inflation_rate_year': 5.6,
        'pension_pfr_contribution_rate_part1': 22,
        'pension_fixed_payment': 8907,
        'pension_point_cost': 145.69,
        'pension_max_salary_limit': 2759000,
        'pension_ipk_past_coef': 0.6
    };
    return { value: defaults[key] !== undefined ? defaults[key] : 0 };
};
settingsService.getPdsCofinSettings = async () => ({
    min_contribution_for_support_per_year: 2000,
    max_state_cofin_amount_per_year: 36000
});
settingsService.getAllPdsCofinIncomeBrackets = async () => ([
    { income_from: 0, income_to: 80000, ratio_numerator: 1, ratio_denominator: 1 },
    { income_from: 80000, income_to: 150000, ratio_numerator: 1, ratio_denominator: 2 },
    { income_from: 150000, income_to: null, ratio_numerator: 1, ratio_denominator: 4 }
]);
settingsService.getAllTaxBrackets = async () => ([
    { income_from: 0, income_to: 5000000, rate: 13 },
    { income_from: 5000000, income_to: null, rate: 15 }
]);
settingsService.calculatePdsCofinancing = async (contrib, income, limit) => {
    // Simple mock logic
    return { state_cofin_amount: Math.min(contrib, limit || 36000) };
};
settingsService.findPassiveIncomeYieldLine = async () => ({
    yield_percent: 12
});

const portfolioRepository = require('../src/repositories/portfolioRepository');
portfolioRepository.findByCriteria = async () => ({
    id: 1,
    riskProfiles: [
        {
            risk_profile: 'BALANCED',
            instruments: [
                { product_id: 101, share_percent: 100, bucket_type: 'INITIAL_CAPITAL' }
            ]
        }
    ]
});

const productRepository = require('../src/repositories/productRepository');
productRepository.findById = async (id) => ({
    id: id,
    name: 'ПДС НПФ (Mock)',
    product_type: 'PDS',
    yields: [{ term_from_months: 0, term_to_months: 1000, amount_from: 0, amount_to: 1e9, yield_percent: 15 }]
});

// Now require the service which will use the patched dependencies
const calculationService = require('../src/services/calculationService');

async function run() {
    console.log('--- Regenerating debug.json (MOCKED) ---');

    // Mock Client Data
    const client = {
        birth_date: '1985-01-01',
        sex: 'male',
        avg_monthly_income: 100000,
        ipk_current: 45.5,
        total_liquid_capital: 100000,
        assets: [
            {
                type: "DEPOSIT",
                amount: 45000,
                current_value: 45000,
                name: "Депозит",
                unlock_month: 0
            }
        ]
    };

    // Mock Goals
    const goals = [
        {
            id: 'goal_pension',
            goal_type_id: 1, // Pension
            name: 'Пенсия (Тест)',
            target_amount: 50000,
            risk_profile: 'BALANCED',
            ipk_current: 45.5
        },
        {
            id: 'goal_res',
            goal_type_id: 7, // FinReserve
            name: 'финрезерв',
            initial_capital: 45000,
            monthly_replenishment: 5000,
            target_amount: 100000,
            term_months: 12,
            risk_profile: 'BALANCED'
        }
    ];

    try {
        const result = await calculationService.calculateFirstRun({ client, goals });

        const debugPath = path.join(__dirname, '../debug.json');

        const output = {
            client_id: 67,
            calculation: result
        };

        fs.writeFileSync(debugPath, JSON.stringify(output, null, 4));
        console.log(`[OK] debug.json updated at ${debugPath}`);

        // Quick verification log
        const pension = result.goals.find(g => g.goal_type_id === 1);
        console.log('Pension IPK Current:', pension?.summary?.ipk_current);
        console.log('Pension Goal Name:', pension?.goal_name);

    } catch (err) {
        console.error('Error generating debug.json:', err);
    }
}

run();
