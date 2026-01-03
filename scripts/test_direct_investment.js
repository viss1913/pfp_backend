
const axios = require('axios');

async function testDirectInvestment() {
    // const url = 'https://pfpbackend-production.up.railway.app/api/client/calculate';
    const url = 'http://localhost:3000/api/client/calculate';

    const payload = {
        client: {
            sex: 'male',
            avg_monthly_income: 130000,
            total_liquid_capital: 50000,
            birth_date: '1990-01-01'
        },
        goals: [
            {
                goal_type_id: 3, // Investment
                name: 'Прямой расчет (Инвестиции)',
                priority: 1,
                // target_amount REMOVED
                monthly_replenishment: 3873,
                initial_capital: 50000,
                term_months: 360,
                risk_profile: 'BALANCED',
                inflation_rate: 5.5
            }
        ]
    };

    try {
        const response = await axios.post(url, payload);
        const result = response.data;

        console.log('\n=== DIRECT INVESTMENT RESULT ===');
        if (result.goals && result.goals.length > 0) {
            console.log(JSON.stringify(result.goals[0], null, 2));
        } else {
            console.log('No goals in result.');
        }
    } catch (error) {
        console.error('API Error:', error.message);
        if (error.response) console.error(JSON.stringify(error.response.data, null, 2));
    }
}

testDirectInvestment();
