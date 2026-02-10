require('dotenv').config({ override: true });
const knex = require('../src/config/database');
const CalculationService = require('../src/services/calculationService');

async function verifyNoRedistribution() {
    console.log('--- STARTING VERIFICATION: NO REDISTRIBUTION DURING RECALC ---');

    try {
        const clientData = {
            birth_date: '1985-01-01',
            sex: 'male',
            avg_monthly_income: 150000,
            total_liquid_capital: 1000000 // 1M RUB Pool
        };

        const goals = [
            {
                id: 'goal_1',
                goal_type_id: 1, // PENSION
                name: 'Pension Goal',
                target_amount: 150000,
                risk_profile: 'BALANCED',
                priority: 4
            },
            {
                id: 'goal_2',
                goal_type_id: 3, // INVESTMENT
                name: 'Investment Goal',
                risk_profile: 'AGGRESSIVE',
                priority: 3
            }
        ];

        // 1. FIRST RUN (Onboarding)
        console.log('\n[1] Running First Run (Onboarding)...');
        const firstRunResult = await CalculationService.calculateFirstRun(
            { client: clientData, goals },
            null,
            null,
            { isFirstRun: true }
        );

        const g1_init_first = firstRunResult.goals.find(g => g.goal_id === 'goal_1').summary.initial_capital;
        const g2_init_first = firstRunResult.goals.find(g => g.goal_id === 'goal_2').summary.initial_capital;

        console.log(`Goal 1 (Pension) Initial Capital: ${g1_init_first}`);
        console.log(`Goal 2 (Investment) Initial Capital: ${g2_init_first}`);

        if (g2_init_first > 0) {
            console.log('✅ Success: Smart Allocation distributed money in First Run.');
        } else {
            console.log('❌ Failure: Money not distributed in First Run.');
        }

        // 2. RECALCULATE (Editing Goal 1)
        console.log('\n[2] Running Recalculate (Editing Goal 1)...');
        // Goal 1 target amount increased
        const updatedGoals = [
            { ...goals[0], target_amount: 200000 },
            goals[1]
        ];

        const recalculateResult = await CalculationService.calculateFirstRun(
            { client: clientData, goals: updatedGoals },
            'goal_1',                 // targetGoalId
            firstRunResult,          // previousCalculation
            { isFirstRun: false }    // options
        );

        const g1_init_recalc = recalculateResult.goals.find(g => g.goal_id === 'goal_1').summary.initial_capital;
        const g2_init_recalc = recalculateResult.goals.find(g => g.goal_id === 'goal_2').summary.initial_capital;

        console.log(`Goal 1 (Pension) Initial Capital after recalc: ${g1_init_recalc}`);
        console.log(`Goal 2 (Investment) Initial Capital after recalc: ${g2_init_recalc}`);

        if (g2_init_recalc === g2_init_first) {
            console.log('✅ Success: Goal 2 initial capital NOT changed during recalculation.');
        } else {
            console.log(`❌ Failure: Goal 2 initial capital changed from ${g2_init_first} to ${g2_init_recalc}!`);
        }

        // 3. FULL RECALCULATE (Multiple Goals changed but still in "Edit" mode)
        console.log('\n[3] Running Full Recalculate (Editing both, but isFirstRun=false)...');
        const recalcResultFull = await CalculationService.calculateFirstRun(
            { client: clientData, goals: updatedGoals },
            null,                 // targetGoalId: null (force recalculate all)
            firstRunResult,       // previousCalculation
            { isFirstRun: false } // options
        );

        const g2_init_full = recalcResultFull.goals.find(g => g.goal_id === 'goal_2').summary.initial_capital;
        console.log(`Goal 2 Initial Capital in full recalc: ${g2_init_full}`);

        // Since it's isFirstRun=false, Smart Allocation should NOT run, even if targetGoalId is null.
        if (g2_init_full === g2_init_first) {
            console.log('✅ Success: Smart Allocation skipped in full recalc mode when isFirstRun=false.');
        } else {
            console.log('❌ Failure: Smart Allocation ran in recalc mode!');
        }

    } catch (error) {
        console.error('❌ Error during verification:', error);
    } finally {
        await knex.destroy();
    }
}

verifyNoRedistribution();
