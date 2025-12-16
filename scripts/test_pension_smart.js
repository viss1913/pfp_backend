require('dotenv').config({ override: true });
const knex = require('../src/config/database');
const CalculationService = require('../src/services/calculationService');
const calculateService = CalculationService;

async function testPensionSmart() {
    console.log('--- STARTING SMART PENSION TEST (ID 1) ---');

    try {
        // 1. Create a client (Age 45, Male)
        // Born in 1980 -> 2024 - 1980 = 44/45 years old
        const clientData = {
            birth_date: '1980-01-01',
            sex: 'male',
            avg_monthly_income: 100000,
            ipk_current: 50 // Optional: pre-set points
        };
        console.log('👤 Client Data:', clientData);

        // 2. Define the Pension Goal
        const pensionGoal = {
            goal_type_id: 1, // PENSION (Merged smart logic here)
            name: 'Моя Пенсия',
            target_amount: 150000, // Desired monthly pension
            term_months: 0, // 0 = calculate term automatically (years to retirement)
            risk_profile: 'BALANCED',
            inflation_rate: 10,
            initial_capital: 0
        };
        console.log('🎯 Goal Data:', pensionGoal);

        // 3. Mock System Settings (Service usually fetches from DB, but we want to confirm logic)
        // We will relay on the service's DB calls. The service looks up settings from DB.

        // 4. Run Calculation
        console.log('\n🧮 Running calculateFirstRun...');
        const result = await calculateService.calculateFirstRun({
            client: clientData,
            goals: [pensionGoal]
        });

        // 5. Analyze Result
        const goalResult = result.results[0];

        if (goalResult.error) {
            console.error('❌ Calculation Failed:', goalResult.error);
            console.error('Details:', goalResult.error_details);
            return;
        }

        console.log('\n✅ Calculation Successful!');
        console.log('-------------------------------------------');

        if (goalResult.state_pension) {
            console.log(`🏦 State Pension Calculation:`);
            console.log(`   - Retirement Age: ${goalResult.state_pension.retirement_age}`);
            console.log(`   - Years to Pension: ${goalResult.state_pension.years_to_pension}`);
            console.log(`   - Predicted Monthly (Future): ${goalResult.state_pension.state_pension_monthly_future} RUB`);
            console.log(`   - Predicted Monthly (Current Prices): ${goalResult.state_pension.state_pension_monthly_current} RUB`);
        } else {
            console.warn('⚠️ No state_pension object returned! Logic check failed.');
        }

        if (goalResult.pension_gap) {
            console.log(`\n📉 Pension Gap:`);
            console.log(`   - Desired (Future): ${goalResult.desired_pension.desired_monthly_income_with_inflation}`);
            console.log(`   - Gap (Monthly Future): ${goalResult.pension_gap.gap_monthly_future} RUB`);
            console.log(`   - Gap (Monthly Current): ${goalResult.pension_gap.gap_monthly_current} RUB`);
            console.log(`   - Has Gap? ${goalResult.pension_gap.has_gap}`);
        }

        if (goalResult.passive_income_calculation) {
            console.log(`\n💰 Capital Calculation (Passive Income Logic):`);
            console.log(`   - Required Capital: ${goalResult.passive_income_calculation.required_capital} RUB`);
            console.log(`   - Yield Line: ${goalResult.passive_income_calculation.yield_percent}%`);
        } else {
            console.warn('⚠️ No capital calculation returned (Gap might be 0 or logic failed).');
        }

        console.log('\n📊 Financials (Recommended Savings):');
        console.log(`   - Recommended Monthly Replenishment: ${goalResult.financials.recommended_replenishment} RUB`);

        console.log('-------------------------------------------');

    } catch (error) {
        console.error('❌ Unexpected Error:', error);
    } finally {
        // Close DB connection
        await knex.destroy();
    }
}

testPensionSmart();
