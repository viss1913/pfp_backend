require('dotenv').config({ override: true });
const calculationService = require('../src/services/calculationService');

const payload = {
    client: {
        birth_date: '1990-01-01', // Age ~35
        sex: 'male',
        avg_monthly_income: 110000
    },
    goals: [
        {
            goal_type_id: 1, // Pension
            name: 'Моя Пенсия',
            target_amount: 80000,
            term_months: 360,
            initial_capital: 70000,
            risk_profile: 'BALANCED',
            start_date: '2025-01-01',
            inflation_rate: 4
        }
    ]
};

async function run() {
    console.log('--- Running Calculation Directly ---');
    try {
        const result = await calculationService.calculateFirstRun(payload);
        console.log(JSON.stringify(result, null, 2));
    } catch (err) {
        console.error('Error:', err);
    } finally {
        // Close DB connections
        require('../src/config/database').destroy();
    }
}

run();
