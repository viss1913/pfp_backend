require('dotenv').config({ override: true });
const calculationService = require('../src/services/calculationService');

const payload = {
    client: {
        birth_date: '1985-01-01', // Age ~40
        sex: 'male',
        avg_monthly_income: 150000
    },
    goals: [
        {
            goal_type_id: 1, // Pension
            name: 'Pension High Load',
            target_amount: 50000000,
            term_months: 360, // 30 years = 360 months
            initial_capital: 1000000,
            risk_profile: 'AGGRESSIVE',
            start_date: '2025-01-01',
            inflation_rate: 6
        }
    ]
};

async function run() {
    console.log('--- Starting Performance Test ---');
    console.time('CalculationDuration');
    try {
        const result = await calculationService.calculateFirstRun(payload);
        console.timeEnd('CalculationDuration');
        console.log('Calculation completed successfully.');
        // console.log(JSON.stringify(result, null, 2));
    } catch (err) {
        console.error('Error:', err);
    } finally {
        require('../src/config/database').destroy();
    }
}

run();
