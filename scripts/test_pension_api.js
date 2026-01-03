
const axios = require('axios');

async function testPensionApi() {
    const url = 'http://localhost:3000/api/client/calculate';

    // Params: Male, 35 (1990), 130k income, 50k capital, 95k desired pension
    const payload = {
        client: {
            sex: 'male',
            avg_monthly_income: 130000,
            total_liquid_capital: 50000,
            birth_date: '1990-01-01'
        },
        goals: [
            {
                goal_type_id: 1, // Pension
                name: 'Госпенсия',
                priority: 1,
                target_amount: 95000,
                term_months: 0,
                risk_profile: 'BALANCED',
                inflation_rate: 5.5
            }
        ]
    };

    try {
        const response = await axios.post(url, payload);
        // console.log(JSON.stringify(response.data, null, 2));
        const goals = response.data.goals || [];
        goals.forEach(g => {
            console.log(`\n=== ${g.goal_name} ===`);
            console.log(`Recommended Replenishment: ${g.financials?.recommended_replenishment || 'N/A'}`);
            console.log(`Without PDS: ${g.financials?.recommended_replenishment_without_pds || 'N/A'}`);
            console.log(`State Benefit: ${g.summary?.state_benefit || 'N/A'}`);
        });
    } catch (error) {
        console.error('API Request Failed:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

testPensionApi();
