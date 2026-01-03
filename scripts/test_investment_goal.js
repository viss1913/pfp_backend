
const axios = require('axios');

async function testInvestmentGoal() {
    const url = 'https://pfpbackend-production.up.railway.app/api/client/calculate';

    // Using Goal Type 4 (Investment/Accumulation)
    // Same params: 30 years, 130k income, 50k capital.
    // Target: 5,297,769 (Initial cost from Pension calculation)
    // Inflation: 5.5
    // Risk: BALANCED
    const payload = {
        client: {
            sex: 'male',
            avg_monthly_income: 130000,
            total_liquid_capital: 50000,
            birth_date: '1990-01-01'
        },
        goals: [
            {
                goal_type_id: 4, // Investment / Accumulation
                name: 'Инвестиции (Сравнение)',
                priority: 1,
                target_amount: 5297769, // Matches Pension "Desired Monthly -> Initial Capital"
                term_months: 360,
                risk_profile: 'BALANCED',
                inflation_rate: 5.5
            }
        ]
    };

    try {
        const response = await axios.post(url, payload);
        const result = response.data;

        if (result.goals && result.goals.length > 0) {
            const goal = result.goals[0];
            console.log('\n=== INVESTMENT GOAL RESULT ===');
            console.log('Goal Type:', goal.goal_type);
            console.log('Replenishment:', goal.financials?.recommended_replenishment);
            console.log('Replenishment (WO PDS):', goal.financials?.recommended_replenishment_without_pds);
            console.log('PDS Applied?', goal.pds_cofinancing ? 'YES' : 'NO');

            if (goal.pds_cofinancing) {
                console.log('PDS Benefit:', goal.pds_cofinancing.total_cofinancing_with_investment);
            }
        }
    } catch (error) {
        console.error('API Error:', error.message);
        if (error.response) console.error(JSON.stringify(error.response.data, null, 2));
    }
}

testInvestmentGoal();
