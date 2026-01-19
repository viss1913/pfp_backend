const calculationService = require('../src/services/calculationService');
const fs = require('fs');
require('dotenv').config();

async function testUserCase() {
    console.log('=== STARTING TEST FOR USER PENSION CASE ===');

    const requestData = {
        client: {
            birth_date: "1987-01-16", // 39 years old
            sex: "male",
            avg_monthly_income: 150000,
            total_liquid_capital: 595692
        },
        assets: [],
        goals: [
            {
                goal_type_id: 1, // PENSION
                name: "ГосПенсия",
                target_amount: 100000, // User wants 100k
                term_months: 300,
                initial_capital: 0, // Let smart allocation take the 595k
                priority: 3
            }
        ],
        liabilities: []
    };

    try {
        console.log('[Test] Running calculation...');
        const result = await calculationService.calculateFirstRun(requestData);

        const pensionGoal = result.goals.find(g => g.goal_type === 'PENSION');

        console.log('\n--- Result Summary ---');
        console.log('Goal Name:', pensionGoal.goal_name);
        console.log('Target Monthly Income:', pensionGoal.details.target_amount_initial);
        console.log('Required Capital (Future):', pensionGoal.summary.total_capital_at_end);
        console.log('Allocated Initial Capital:', pensionGoal.summary.initial_capital);
        console.log('Recommended Replenishment:', pensionGoal.summary.monthly_replenishment);
        console.log('Status:', pensionGoal.summary.status);

        console.log('\n--- Pension Details ---');
        console.log('Future State Pension:', pensionGoal.details.future_state_pension);
        console.log('Years to Pension:', pensionGoal.details.years_to_pension);
        console.log('Yield Percent:', pensionGoal.details.yield_percent);

        // Save to file for further inspection
        fs.writeFileSync('./scripts/test_pension_result.json', JSON.stringify(result, null, 2));
        console.log('\nDetailed result saved to scripts/test_pension_result.json');

    } catch (error) {
        console.error('Calculation Failed:', error);
    }
}

testUserCase().catch(console.error);
