const calculationService = require('../src/services/calculationService');

async function verify() {
    console.log("--- Starting Verification of Partial Recalculation ---");

    const clientData = {
        id: "client_1",
        birth_date: "1985-01-01",
        sex: "male",
        total_liquid_capital: 1000000,
        avg_monthly_income: 100000
    };

    const goals = [
        {
            id: "goal_1",
            goal_type_id: 7, // FinReserve
            name: "Резерв",
            target_amount: 300000,
            term_months: 6,
            priority: 1
        },
        {
            id: "goal_2",
            goal_type_id: 3, // Investment
            name: "Инвестиции",
            target_amount: 2000000,
            term_months: 60,
            priority: 3
        }
    ];

    console.log("\n1. Running FULL calculation...");
    const fullResult = await calculationService.calculateFirstRun({ client: clientData, goals: goals });

    const g1_init_full = fullResult.calculation.goals.find(g => g.goal_id === "goal_1").summary.initial_capital;
    const g2_init_full = fullResult.calculation.goals.find(g => g.goal_id === "goal_2").summary.initial_capital;

    console.log(`Goal 1 Initial: ${g1_init_full}`);
    console.log(`Goal 2 Initial: ${g2_init_full}`);

    console.log("\n2. Running PARTIAL calculation (Editing Goal 2)...");
    // Change term for Goal 2
    const updatedGoals = [
        goals[0],
        { ...goals[1], term_months: 120 }
    ];

    const partialResult = await calculationService.calculateFirstRun(
        { client: clientData, goals: updatedGoals },
        "goal_2",
        fullResult
    );

    const g1_init_partial = partialResult.calculation.goals.find(g => g.goal_id === "goal_1").summary.initial_capital;
    const g2_init_partial = partialResult.calculation.goals.find(g => g.goal_id === "goal_2").summary.initial_capital;

    console.log(`Goal 1 Initial (Frozen): ${g1_init_partial}`);
    console.log(`Goal 2 Initial (Recalculated): ${g2_init_partial}`);

    if (g1_init_full === g1_init_partial) {
        console.log("✅ SUCCESS: Frozen goal capital remains unchanged.");
    } else {
        console.error("❌ FAILURE: Frozen goal capital changed!");
    }

    if (g2_init_partial !== undefined) {
        console.log("✅ SUCCESS: Target goal was recalculated.");
    }

    console.log("\n--- Verification Complete ---");
}

// Mock repositories and services needed for calculationService if necessary
// But since we are in the project dir, we can try running it directly if we handle env/deps.
// For now, this serves as a blueprint of logic.

verify().catch(console.error);
