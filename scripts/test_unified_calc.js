// CONSTANTS
const BASE_URL = 'https://pfpbackend-production.up.railway.app/api/client/calculate';

const payload = {
    "client": {
        "birth_date": "1990-01-01",
        "sex": "male",
        "avg_monthly_income": 150000
    },
    "goals": [
        /*
        {
            "goal_type_id": 4,
            "name": "Buying a Car",
            "target_amount": 5000000,
            "term_months": 36,
            "risk_profile": "AGGRESSIVE",
      
            "monthly_replenishment": 50000,
            "inflation_rate": 8
        },
        {
            "goal_type_id": 2,
            "name": "Passive Income / Rentier",
            "target_amount": 100000,
            "term_months": 120,
            "risk_profile": "BALANCED",
            "initial_capital": 1000000,
        
            "inflation_rate": 8
        },
        */
        {
            "goal_type_id": 1,
            "name": "Happy Pension",
            "target_amount": 150000,
            "risk_profile": "CONSERVATIVE",
            "initial_capital": 100000,
           
            "inflation_rate": 8
        }
        /*
        ,
        {
            "goal_type_id": 4,
            "name": "Custom Goal (Other)",
            "target_amount": 1000000,
            "term_months": 60,
            "risk_profile": "BALANCED",
            "initial_capital": 100000,
       
            "inflation_rate": 8
        }
        */
    ]
};

async function testCalculation() {
    console.log('Sending unified calculation request...');
    console.log('URL:', BASE_URL);
    // console.log('Payload:', JSON.stringify(payload, null, 2));

    try {
        const response = await fetch(BASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const status = response.status;
        console.log('\nResponse Status:', status);

        const responseText = await response.text();
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (e) {
            console.error('❌ Failed to parse JSON response');
            console.log('Response Preview:', responseText.substring(0, 500)); // Print first 500 chars
            return;
        }

        if (status >= 400) {
            console.error('❌ Request Failed');
            console.log('Error Data:', JSON.stringify(data, null, 2));
            return;
        }

        console.log('✅ Calculation Successful!');
        console.log('Results count:', data.results ? data.results.length : 0);

        // Inspect valid results
        if (data.results) {
            data.results.forEach((res, index) => {
                console.log(`\n--- Result ${index + 1}: ${res.goal_name} (${res.goal_type}) ---`);
                if (res.error) {
                    console.log('🔴 Error:', res.error);
                } else {
                    console.log('Status:', res.summary ? res.summary.status : 'N/A');

                    if (res.summary) {
                        console.log('Summary OK ✓');
                        const summary = res.summary;
                        console.log(`  Initial Cap: ${summary.initial_capital}`);
                        console.log(`  Monthly Replenishment (Final): ${summary.monthly_replenishment}`);
                        console.log(`  Monthly Replenishment (No PDS): ${summary.monthly_replenishment_without_pds}`);
                        console.log(`  State Benefit: ${summary.state_benefit}`);
                    } else {
                        console.log('Summary BLock MISSING ❌');
                    }

                    if (res.portfolio_structure) {
                        console.log('Portfolio Structure OK ✓');
                        const comp = res.portfolio_structure.portfolio_composition;
                        if (comp) {
                            console.log(`  Composition: ${comp.initial_capital_allocation.length} init items, ${comp.monthly_topup_allocation.length} topup items`);
                            // Print first item name to verify real data
                            if (comp.initial_capital_allocation.length > 0) {
                                console.log(`  Sample Product: ${comp.initial_capital_allocation[0].product_name} (${comp.initial_capital_allocation[0].share_percent}%)`);
                            }
                        } else {
                            console.log('  Composition object MISSING ❌');
                        }
                    } else {
                        console.log('Portfolio Structure MISSING ❌');
                    }
                }
            });
        }

    } catch (error) {
        console.error('❌ Calculation Failed (Network/Script Error)');
        console.log('Error:', error.message);
    }
}

testCalculation();
