const calculationService = require('../src/services/calculationService');
const settingsService = require('../src/services/settingsService');
require('dotenv').config();

async function debugCalculation() {
    console.log('=== Starting Debug Calculation ===');

    const requestData = {
        client: {
            birth_date: "1986-12-31",
            sex: "male",
            avg_monthly_income: 150000,
            total_liquid_capital: 3500000,
            first_name: "куцецку",
            last_name: "Unknown",
            middle_name: "",
            phone: "435435345",
            external_uuid: "1ca6c7da-f6fb-4430-b2ac-4de6a831384f"
        },
        assets: [
            {
                type: "CASH",
                name: "Наличные",
                current_value: 3500000,
                currency: "RUB",
                start_date: "2026-01-16",
                risk_level: "conservative"
            }
        ],
        goals: [
            {
                goal_type_id: 1,
                name: "ГосПенсия",
                risk_profile: "BALANCED",
                inflation_rate: 5.6,
                target_amount: 100000,
                desired_monthly_income: 100000,
                term_months: 120
            },
            {
                goal_type_id: 9,
                name: "Загородная недвижимость",
                risk_profile: "BALANCED",
                inflation_rate: 5.6,
                target_amount: 8900000,
                term_months: 60
            },
            {
                goal_type_id: 7,
                name: "Финансовый резерв",
                risk_profile: "CONSERVATIVE",
                inflation_rate: 10,
                initial_capital: 100000,
                monthly_replenishment: 5000,
                target_amount: 100000,
                term_months: 12
            },
            {
                goal_type_id: 5,
                name: "Защита Жизни",
                risk_profile: "CONSERVATIVE",
                inflation_rate: 10,
                target_amount: 1500000,
                term_months: 180
            }
        ],
        liabilities: []
    };

    try {
        const result = await calculationService.calculateFirstRun(requestData);

        console.log('\n=== CALCULATION RESULTS ===');
        console.log('Summary Total Capital at end:', result.summary.total_capital);
        console.log('Summary Total State Benefit:', result.summary.total_state_benefit);

        result.goals.forEach((g, idx) => {
            console.log(`\nGoal ${idx + 1}: ${g.goal_name} (${g.goal_type || g.goal_id})`);
            console.log('  Status:', g.summary?.status);
            console.log('  Initial Capital:', g.summary?.initial_capital);
            console.log('  Monthly Replenishment:', g.summary?.monthly_replenishment);
            console.log('  Total Capital at end:', g.summary?.total_capital_at_end);
            console.log('  Target Achieved:', g.summary?.target_achieved);
            if (g.error) console.log('  ERROR:', g.error);
        });

        // Write to file for detailed inspection
        const fs = require('fs');
        const path = require('path');
        const outputPath = path.join(__dirname, 'debug_calc_result.json');
        fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
        console.log(`\nDetailed result saved to: ${outputPath}`);

    } catch (error) {
        console.error('Calculation Failed:', error);
    }
}

debugCalculation();
