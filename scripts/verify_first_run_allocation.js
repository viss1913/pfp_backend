require('dotenv').config({ override: true });
const knex = require('../src/config/database');
const calculationService = require('../src/services/calculationService');

async function verifyFirstRunAllocation() {
    console.log('--- STARTING VERIFICATION: FIRST RUN ALLOCATION ---');

    try {
        const clientData = {
            avg_monthly_income: 150000,
            total_liquid_capital: 1000000,
            birth_date: '1990-01-01',
            sex: 'male',
            assets: []
        };

        const goals = [
            {
                goal_type_id: 7, // FIN_RESERVE
                name: 'Reserve',
                target_amount: 100000,
                priority: 1
            },
            {
                goal_type_id: 4, // OTHER (e.g. Education)
                name: 'Education',
                target_amount: 3000000, // Large target to avoid capping
                term_months: 60,
                risk_profile: 'BALANCED'
            },
            {
                goal_type_id: 1, // PENSION
                name: 'Pension',
                target_amount: 100000, // monthly income today
                term_months: 240,
                risk_profile: 'BALANCED'
            }
        ];

        console.log('Calculating first run with 1,000,000 pool...');
        const result = await calculationService.calculateFirstRun({ client: clientData, goals }, null, null, { isFirstRun: true, usePool: true });

        let totalAllocated = 0;
        result.goals.forEach(g => {
            if (g.error) {
                console.log(`Goal: ${g.name || g.goal_type} - FAILED with error: ${g.error}`);
                return;
            }
            const init = g.summary ? g.summary.initial_capital : 0;
            console.log(`Goal: ${g.goal_type || g.name}, Initial Capital: ${init}`);
            totalAllocated += init;
        });

        console.log(`\nTotal Allocated Capital: ${totalAllocated}`);

        if (totalAllocated === 1000000) {
            console.log('✅ Success: All 1,000,000 distributed correctly.');
        } else {
            console.log(`❌ Failure: Only ${totalAllocated} distributed. Check double-deduction or allocation logic.`);
        }

    } catch (error) {
        console.error('❌ Error during verification:', error);
    } finally {
        await knex.destroy();
    }
}

verifyFirstRunAllocation();
