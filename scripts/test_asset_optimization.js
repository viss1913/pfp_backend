// No axios dependency needed, using fetch

async function testAssetOptimization() {
    const url = 'http://localhost:3001/api/client/calculate';

    const payload = {
        client: {
            total_liquid_capital: 700000,
            birth_date: '1990-01-01',
            sex: 'male',
            avg_monthly_income: 200000,
            assets: [
                { type: 'DEPOSIT', amount: 500000, unlock_month: 6, name: 'Депозит' }
            ]
        },
        goals: [
            {
                id: 'reservoir',
                name: 'Резерв',
                goal_type_id: 3, // Assuming other/investment for reservoir for now
                target_amount: 300000,
                term_months: 1,
                risk_profile: 'CONSERVATIVE',
                priority: 1
            },
            {
                id: 'car',
                name: 'Машина',
                goal_type_id: 3,
                target_amount: 2000000,
                term_months: 24,
                risk_profile: 'BALANCED',
                priority: 2
            },
            {
                id: 'retirement',
                name: 'Пенсия',
                goal_type_id: 1, // PENSION
                target_amount: 100000, // Monthly income
                risk_profile: 'CONSERVATIVE',
                priority: 3
            }
        ]
    };

    try {
        console.log('--- TEST: Smart Asset Optimization ---');
        console.log('Sending payload with Pool (700k) and Deposit (500k in month 6)...');

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        const data = await response.json();

        if (!data.goals) {
            console.error('❌ No goals found in response:', data);
            return;
        }

        data.goals.forEach(goal => {
            console.log(`\nGoal: ${goal.goal_name}`);
            console.log(`- Type: ${goal.summary.goal_type}`);
            console.log(`- Target (Future): ${goal.summary.projected_value || goal.summary.total_capital_at_end}`);
            console.log(`- Recommended Replenishment: ${goal.summary.monthly_replenishment}`);
            console.log(`- Initial Capital (Taken from Pool): ${goal.summary.initial_capital}`);

            if (goal.goal_name === 'Резерв') {
                if (goal.summary.monthly_replenishment <= 1) { // allow for small float diff
                    console.log('✅ SUCCESS: Reservoir fully funded by pool.');
                } else {
                    console.error('❌ FAIL: Reservoir recommended replenishment is:', goal.summary.monthly_replenishment);
                }
            }
        });

    } catch (error) {
        console.error('Test failed:', error.response?.data || error.message);
    }
}

testAssetOptimization();
