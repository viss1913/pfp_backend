
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
    // console.log('Payload:', JSON.stringify(payload, null, 2));

    try {
        const response = await axios.post(url, payload);
        const result = response.data;

        console.log('\n=== API Response ===');

        if (result.goals && result.goals.length > 0) {
            const pensionGoal = result.goals.find(g => g.goal_type === 'PENSION');
            if (pensionGoal) {
                console.log('\n=> Pension Goal Found');

                console.log('\n--- Gap Analysis ---');
                console.log('Recommended Replenishment (WITH PDS):', Math.round(pensionGoal.financials?.recommended_replenishment || 0));
                console.log('Recommended Replenishment (WO PDS):', Math.round(pensionGoal.financials?.recommended_replenishment_without_pds || 0));

                if (pensionGoal.pds_cofinancing) {
                    console.log('\n--- PDS & TAX DETAILS ---');
                    console.log('State Cofinancing (With Inv):', Math.round(pensionGoal.pds_cofinancing.total_cofinancing_with_investment));
                    console.log('Tax Deductions (Nominal):', Math.round(pensionGoal.pds_cofinancing.total_tax_deductions_nominal || 0));
                    console.log('Tax Deductions (With Inv):', Math.round(pensionGoal.pds_cofinancing.total_tax_deductions_with_investment || 0));

                    // Check yearly breakdown
                    const breakdown = pensionGoal.pds_cofinancing.yearly_breakdown;
                    if (breakdown && breakdown.length > 0) {
                        console.log(`Breakdown Years: ${breakdown.length}`);
                        // Show Year 1, Year 10, Year 20, Last Year
                        [0, 9, 19, breakdown.length - 1].forEach(idx => {
                            if (breakdown[idx]) {
                                const y = breakdown[idx];
                                console.log(`Year ${y.year}: Refund Received = ${y.tax_refund_received}, Refund Projected = ${y.tax_refund_projected}`);
                            }
                        });
                    }
                }
            } else {
                console.log('No PENSION goal found.');
            }
        }
    } catch (error) {
        console.error('API Request Failed:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

testPensionApi();
