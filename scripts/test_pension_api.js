
const axios = require('axios');

async function testPensionApi() {
    const url = 'https://pfpbackend-production.up.railway.app/api/client/calculate';

    const payload = {
        client: {
            sex: 'male',
            // age: 35, // Not allowed by Joi, derived from birth_date
            avg_monthly_income: 110000,
            total_liquid_capital: 50000, // Was current_capital
            birth_date: '1990-01-01'
        },
        goals: [
            {
                goal_type_id: 1, // Pension
                name: 'Госпенсия',
                priority: 1,
                target_amount: 100000,
                term_months: 0,
                risk_profile: 'BALANCED',
                inflation_rate: 5.5 // Moved here
            }
        ]
    };

    console.log('Sending API request to:', url);
    console.log('Payload:', JSON.stringify(payload, null, 2));

    try {
        const response = await axios.post(url, payload);
        const result = response.data;

        console.log('\n=== API Response ===');
        // console.log(JSON.stringify(result, null, 2));

        if (result.goals && result.goals.length > 0) {
            const pensionGoal = result.goals.find(g => g.goal_type === 'PENSION');
            if (pensionGoal) {
                console.log('\n=> Pension Goal Found:');
                console.log('State Pension (Projected Monthly):', Math.round(pensionGoal.state_pension?.state_pension_monthly_future || 0));
                console.log('State Pension (Today\'s Prices):', Math.round(pensionGoal.state_pension?.state_pension_monthly_current || 0));

                console.log('\n--- Gap Analysis ---');
                console.log('Desired Pension (Initial):', Math.round(pensionGoal.desired_pension?.desired_monthly_income_initial || 0));
                console.log('Gap (Monthly Future):', Math.round(pensionGoal.pension_gap?.gap_monthly_future || 0));

                if (pensionGoal.pension_gap?.has_gap) {
                    console.log('GAP DETECTED!');
                    console.log('Recommended Replenishment (WITH PDS):', Math.round(pensionGoal.financials?.recommended_replenishment || 0));
                    console.log('Recommended Replenishment (WO PDS):', Math.round(pensionGoal.financials?.recommended_replenishment_without_pds || 0));

                    if (pensionGoal.pds_cofinancing) {
                        console.log('PDS Applied! Total Benefit:', Math.round(pensionGoal.pds_cofinancing.total_cofinancing_with_investment));
                    } else {
                        console.log('No PDS applied.');
                    }
                }

                if (pensionGoal.error) {
                    console.error('GOAL ERROR:', pensionGoal.error);
                }
            } else {
                console.log('No PENSION goal found.');
            }
        }
    } catch (error) {
        console.error('API Request Failed:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        }
    }
}

testPensionApi();
