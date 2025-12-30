
require('dotenv').config();
const calculationService = require('../src/services/calculationService');
const portfolioRepository = require('../src/repositories/portfolioRepository');
const knex = require('../src/config/database');

async function testStatePension() {
    console.log('=== PRE-CHECK: Portfolio for Class 1 ===');
    try {
        const p = await portfolioRepository.findByCriteria({ classId: 1, amount: 0, term: 360 });
        console.log('Portfolio found:', p ? `${p.id} - ${p.name}` : 'NONE');
        if (p) {
            // console.log('Raw risk_profiles:', p.risk_profiles);
            let profiles = [];
            try {
                profiles = typeof p.risk_profiles === 'string' ? JSON.parse(p.risk_profiles) : p.risk_profiles;
            } catch (e) { console.error('Parse error:', e); }

            console.log('Parsed Profiles Count:', profiles.length);
            console.log('Profile Types:', profiles.map(pr => pr.profile_type));
            const balanced = profiles.find(pr => pr.profile_type === 'BALANCED');
            console.log('BALANCED profile found?', !!balanced);
        }
    } catch (err) {
        console.error('Pre-check failed:', err);
    }
    console.log('=== END PRE-CHECK ===\n');

    console.log('=== TESTING STATE PENSION REQUEST ===\n');

    const clientData = {
        age: 35,
        sex: 'male',
        income_amount: 110000,
        current_capital: 50000,
        inflation_rate: 5.5,
        avg_monthly_income: 110000,
        birth_date: '1990-01-01',
        goals: [
            {
                goal_type_id: 1, // Pension
                name: 'Госпенсия',
                priority: 1,
                target_amount: 100000, // Desired Pension
                term_months: 0,
                risk_profile: 'BALANCED' // Required for gap calculation
            }
        ]
    };

    try {
        console.log('Sending request...');
        const requestPayload = {
            client: clientData,
            goals: clientData.goals
        };

        const result = await calculationService.calculateFirstRun(requestPayload);

        console.log('\n--- Simulation Result ---');

        if (!result) {
            console.log('No result returned.');
            return;
        }

        console.log('Result Keys:', Object.keys(result));

        if (result.goals && result.goals.length > 0) {
            console.log(`\nFound ${result.goals.length} goals in response.`);

            const pensionGoal = result.goals.find(g => g.goal_type === 'PENSION');
            if (pensionGoal) {
                console.log('\n=> Pension Goal Found (Full Object):');
                // console.log(JSON.stringify(pensionGoal, null, 2));

                console.log('State Pension (Projected Monthly):', Math.round(pensionGoal.state_pension?.state_pension_monthly_future || 0));
                console.log('State Pension (Today\'s Prices):', Math.round(pensionGoal.state_pension?.state_pension_monthly_current || 0));

                console.log('\n--- Gap Analysis ---');
                console.log('Desired Pension (Initial):', Math.round(pensionGoal.desired_pension?.desired_monthly_income_initial || 0));
                console.log('Gap (Monthly Future):', Math.round(pensionGoal.pension_gap?.gap_monthly_future || 0));

                if (pensionGoal.pension_gap?.has_gap) {
                    console.log('GAP DETECTED!');
                    console.log('Recommended Replenishment (to cover gap):', Math.round(pensionGoal.financials?.recommended_replenishment || 0));

                    // PDS Effect?
                    if (pensionGoal.pds_cofinancing) {
                        console.log('\n--- PDS Cofinancing Effect ---');
                        console.log('PDS Applied:', true);
                        console.log('Total Nominal Cofinancing:', Math.round(pensionGoal.pds_cofinancing.total_cofinancing_nominal));
                        console.log('State Benefit (Future Value):', Math.round(pensionGoal.pds_cofinancing.total_cofinancing_with_investment));
                    } else {
                        console.log('\nNo PDS Cofinancing applied to this goal.');
                    }
                }

                // Financials
                if (pensionGoal.financials) {
                    console.log('\n--- Financial Summary ---');
                    console.log('Initial Capital Used:', pensionGoal.financials.initial_capital);
                    console.log('Total Capital Needed (at retirement):', Math.round(pensionGoal.financials.cost_with_inflation));
                }
            } else {
                console.log('No PENSION goal found in response goals. Types:', result.goals.map(g => g.goal_type));
            }

        } else {
            console.log('No "goals" array or empty.');
        }

    } catch (e) {
        console.error('Calculation Error:', e);
    } finally {
        await knex.destroy();
    }
}

testStatePension();
