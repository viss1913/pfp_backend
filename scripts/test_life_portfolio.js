/**
 * Test Script: Verify Life Insurance Payment Frequency Implementation
 * Tests different payment variants: single, monthly, annual
 */

const calculationService = require('../src/services/calculationService');

async function testLifeInsurancePaymentFrequency() {
    console.log('\n=== TESTING LIFE INSURANCE PAYMENT FREQUENCY ===\n');

    // Test Case 1: Annual Payment (payment_variant = 12)
    console.log('📋 TEST CASE 1: ANNUAL PAYMENT (payment_variant = 12)\n');

    const testAnnual = {
        client: {
            birth_date: '1985-03-15',
            sex: 'male',
            avg_monthly_income: 150000,
            total_liquid_capital: 200000
        },
        goals: [
            {
                goal_type_id: 5,
                name: 'НСЖ - Годовой взнос',
                target_amount: 5000000,
                term_months: 120,
                payment_variant: 12, // ANNUAL
                program: 'test'
            }
        ]
    };

    try {
        const result = await calculationService.calculateFirstRun(testAnnual);
        const lifeGoal = result.goals[0];

        console.log('✅ Summary:');
        console.log(`   Initial Capital: ${lifeGoal.summary.initial_capital}`);
        console.log(`   Monthly Replenishment: ${lifeGoal.summary.monthly_replenishment}`);
        console.log(`   Payment Frequency: ${lifeGoal.summary.payment_frequency}`);

        console.log('\n✅ Details:');
        console.log(`   Annual Premium: ${lifeGoal.details.annual_premium}`);
        console.log(`   Replenishment Amount: ${lifeGoal.details.replenishment_amount}`);
        console.log(`   Payment Frequency: ${lifeGoal.details.payment_frequency}`);

        console.log('\n✅ Portfolio Instruments:');
        console.log('   Initial Capital:', JSON.stringify(lifeGoal.details.initial_capital_instruments, null, 2));
        console.log('   Replenishments:', JSON.stringify(lifeGoal.details.monthly_savings_instruments, null, 2));

        console.log('\n✅ Consolidated Portfolio:');
        const consolidated = result.summary.consolidated_portfolio;
        console.log('   Assets:', JSON.stringify(consolidated.assets_allocation, null, 2));
        console.log('   Cash Flow:', JSON.stringify(consolidated.cash_flow_allocation, null, 2));

        // Validation
        console.log('\n🔍 VALIDATION:');
        const isValid =
            lifeGoal.summary.payment_frequency === 'annual' &&
            lifeGoal.details.payment_frequency === 'annual' &&
            lifeGoal.summary.monthly_replenishment === 0 &&
            lifeGoal.details.monthly_savings_instruments.length > 0 &&
            lifeGoal.details.monthly_savings_instruments[0].payment_frequency === 'annual';

        if (isValid) {
            console.log('✅✅✅ TEST 1 PASSED: Annual payment correctly configured!');
        } else {
            console.log('❌❌❌ TEST 1 FAILED: Annual payment configuration incorrect!');
        }

    } catch (error) {
        console.error('❌ TEST 1 ERROR:', error.message);
    }

    // Test Case 2: Monthly Payment (payment_variant = 1)
    console.log('\n\n📋 TEST CASE 2: MONTHLY PAYMENT (payment_variant = 1)\n');

    const testMonthly = {
        client: {
            birth_date: '1985-03-15',
            sex: 'male',
            avg_monthly_income: 150000,
            total_liquid_capital: 200000
        },
        goals: [
            {
                goal_type_id: 5,
                name: 'НСЖ - Ежемесячный взнос',
                target_amount: 5000000,
                term_months: 120,
                payment_variant: 1, // MONTHLY
                program: 'test'
            }
        ]
    };

    try {
        const result = await calculationService.calculateFirstRun(testMonthly);
        const lifeGoal = result.goals[0];

        console.log('✅ Summary:');
        console.log(`   Initial Capital: ${lifeGoal.summary.initial_capital}`);
        console.log(`   Monthly Replenishment: ${lifeGoal.summary.monthly_replenishment}`);
        console.log(`   Payment Frequency: ${lifeGoal.summary.payment_frequency}`);

        console.log('\n✅ Consolidated Portfolio Cash Flow:');
        const consolidated = result.summary.consolidated_portfolio;
        console.log(JSON.stringify(consolidated.cash_flow_allocation, null, 2));

        // Validation
        console.log('\n🔍 VALIDATION:');
        const isValid =
            lifeGoal.summary.payment_frequency === 'monthly' &&
            lifeGoal.summary.monthly_replenishment > 0 &&
            lifeGoal.details.monthly_savings_instruments[0].payment_frequency === 'monthly';

        if (isValid) {
            console.log('✅✅✅ TEST 2 PASSED: Monthly payment correctly configured!');
        } else {
            console.log('❌❌❌ TEST 2 FAILED: Monthly payment configuration incorrect!');
        }

    } catch (error) {
        console.error('❌ TEST 2 ERROR:', error.message);
    }

    // Test Case 3: Single Premium (payment_variant = 0)
    console.log('\n\n📋 TEST CASE 3: SINGLE PREMIUM (payment_variant = 0)\n');

    const testSingle = {
        client: {
            birth_date: '1985-03-15',
            sex: 'male',
            avg_monthly_income: 150000,
            total_liquid_capital: 5200000
        },
        goals: [
            {
                goal_type_id: 5,
                name: 'НСЖ - Единовременный взнос',
                target_amount: 5000000,
                term_months: 120,
                payment_variant: 0, // SINGLE
                program: 'test'
            }
        ]
    };

    try {
        const result = await calculationService.calculateFirstRun(testSingle);
        const lifeGoal = result.goals[0];

        console.log('✅ Summary:');
        console.log(`   Initial Capital: ${lifeGoal.summary.initial_capital}`);
        console.log(`   Monthly Replenishment: ${lifeGoal.summary.monthly_replenishment}`);
        console.log(`   Payment Frequency: ${lifeGoal.summary.payment_frequency}`);

        console.log('\n✅ Details:');
        console.log(`   Replenishment Instruments Length: ${lifeGoal.details.monthly_savings_instruments.length}`);

        // Validation
        console.log('\n🔍 VALIDATION:');
        const isValid =
            lifeGoal.summary.payment_frequency === 'once' &&
            lifeGoal.summary.monthly_replenishment === 0 &&
            lifeGoal.details.monthly_savings_instruments.length === 0;

        if (isValid) {
            console.log('✅✅✅ TEST 3 PASSED: Single premium correctly configured!');
        } else {
            console.log('❌❌❌ TEST 3 FAILED: Single premium configuration incorrect!');
        }

    } catch (error) {
        console.error('❌ TEST 3 ERROR:', error.message);
    }
}

testLifeInsurancePaymentFrequency()
    .then(() => {
        console.log('\n\n✅ All tests completed\n');
        process.exit(0);
    })
    .catch(err => {
        console.error('\n❌ Test suite failed:', err);
        process.exit(1);
    });
