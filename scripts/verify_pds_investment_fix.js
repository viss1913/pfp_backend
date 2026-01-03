const calculationService = require('../src/services/calculationService');

async function verify() {
    const data = {
        client: {
            avg_monthly_income: 150000,
            total_liquid_capital: 100000,
            assets: [
                {
                    name: "Existing PDS",
                    current_value: 50000,
                    product_type: "PDS",
                    goal_id: 3 // Link to investment goal
                }
            ]
        },
        goals: [
            {
                id: 3,
                goal_type_id: 3,
                name: "Investment Goal",
                initial_capital: 100000,
                monthly_replenishment: 10000,
                term_months: 120, // 10 years
                risk_profile: "BALANCED"
            }
        ]
    };

    try {
        console.log("Running calculation...");
        const result = await calculationService.calculateFirstRun(data);
        const invGoal = result.goals.find(r => r.goal_type === 'INVESTMENT');

        if (!invGoal) {
            console.error("Investment goal not found in results");
            return;
        }

        console.log("--- RESULTS ---");
        console.log("Replenishment Used:", invGoal.investment_calculation.monthly_replenishment_start);
        console.log("Total Capital:", invGoal.summary.total_capital_at_end);
        console.log("Own Contributions:", invGoal.investment_calculation.total_own_contributions);
        console.log("State Benefit (Cofin + Tax):", invGoal.summary.state_benefit);

        if (invGoal.investment_calculation.monthly_replenishment_start === 10000) {
            console.log("✅ OK: Replenishment prioritized correctly");
        } else {
            console.log("❌ FAIL: Replenishment NOT prioritized correctly");
        }

        // Check if state_benefit is more than just cofinancing (360k roughly)
        if (invGoal.summary.state_benefit > 360000) {
            console.log("✅ OK: Tax benefits seem to be included in state_benefit");
        } else {
            console.log("❌ FAIL: state_benefit might be missing tax refunds");
        }

    } catch (e) {
        console.error("Verification failed with error:", e);
    }
}

verify();
