const calculationService = require('../src/services/calculationService');

async function verifyExcelSync() {
    // Parameters from the Excel screenshot
    // row 2: Jan 15 2026, 100 000
    // row 3: Feb 15 2026, 5000
    // Growth: 0.33% indexation
    // Yield: ~13% (derived from 1023.68/100000 monthly)

    console.log("--- SIMULATING EXCEL PARAMETERS ---");
    const testData = {
        client: {
            avg_monthly_income: 180000,
            total_liquid_capital: 0 // We'll put it in goal initial
        },
        goals: [{
            id: 1,
            goal_type_id: 3, // INVESTMENT
            name: "Excel Match Test",
            initial_capital: 100000,
            monthly_replenishment: 5000,
            target_amount: 10000000,
            term_months: 27, // Up to Row 29 in Excel
            target_yield: 0.13,
            risk_profile: 'BALANCED',
            start_date: '2026-01-15',
            instruments: [
                { product_id: 1, share_percent: 100 } // Assume 100% PDS to match Excel
            ]
        }],
        portfolio: {
            yield_annual: 0.13,
            instruments: [{ product_id: 1, bucket_type: 'INITIAL', share_percent: 100, product_type: 'PDS' }]
        }
    };

    const result = await calculationService.calculateFirstRun(testData);
    const goalResult = result.goals[0];

    console.log(`Month 27 (End of Row 29)`);
    console.log(`Code Total Capital: ${Math.round(goalResult.summary.total_capital_at_end)}`);
    console.log(`Excel Total Capital: 362935`);
    console.log(`Difference: ${Math.round(goalResult.summary.total_capital_at_end - 362935)}`);

    console.log("\nDetails:");
    console.log(`State Benefit (Cofin + Tax): ${goalResult.summary.state_benefit}`);
    // Extract cofin and tax to verify
    const pds = goalResult.pds_cofinancing;
    if (pds) {
        console.log(`- Cofinancing with Invest: ${pds.total_cofinancing_with_investment}`);
    }
}

// Mocking productRepository and others if needed might be tricky, let's just run it
verifyExcelSync().catch(console.error);
