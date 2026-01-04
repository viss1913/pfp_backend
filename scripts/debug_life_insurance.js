const calculationService = require('../src/services/calculationService');
const db = require('../src/config/database');

async function runDebug() {
    const mockRequest = {
        goals: [
            {
                goal_type_id: 5,
                name: "Страхование жизни",
                target_amount: 5000000,
                term_months: 240,
                risk_profile: "conservative",
                priority: 1,
                payment_variant: 12 // Monthly
            },
            {
                goal_type_id: 4,
                name: "Недвижимость",
                target_amount: 10000000,
                term_months: 120,
                risk_profile: "balanced",
                priority: 2
            }
        ],
        client: {
            birth_date: "1986-12-31",
            sex: "female",
            avg_monthly_income: 150000,
            total_liquid_capital: 0, // In pool
            assets: [
                {
                    type: "CASH",
                    name: "Свободные средства",
                    current_value: 2000000,
                    currency: "RUB",
                    start_date: "2026-01-04"
                }
            ]
        }
    };

    console.log('Running calculation...');
    try {
        const result = await calculationService.calculateFirstRun(mockRequest);

        console.log('=== CALCULATION SUMMARY ===');
        console.log('Total Capital:', result.summary.total_capital);

        const life = result.goals.find(g => g.goal_type === 'LIFE');
        const house = result.goals.find(g => g.goal_name === 'Недвижимость');

        console.log('\n=== GOAL 1: LIFE INSURANCE ===');
        if (life) {
            console.log('Status:', life.summary.status);
            console.log('Initial Capital (Deducted):', life.summary.initial_capital);
            console.log('Monthly Replenishment:', life.summary.monthly_replenishment);
            console.log('Warnings:', life.nsj_calculation ? life.nsj_calculation.warnings : 'None');
        } else {
            console.log('NOT FOUND');
        }

        console.log('\n=== GOAL 2: REAL ESTATE ===');
        if (house) {
            console.log('Status:', house.summary.status);
            console.log('Initial Capital (Remaining):', house.summary.initial_capital);
            console.log('Projected Value:', house.summary.projected_value);
        } else {
            console.log('NOT FOUND');
        }

    } catch (err) {
        console.error('Calculation failed:', err);
    } finally {
        await db.destroy();
    }
}

runDebug();
