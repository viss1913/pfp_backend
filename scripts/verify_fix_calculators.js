const BaseCalculator = require('../src/services/calculators/BaseCalculator');
const calculator = new BaseCalculator();

const mockPortfolio = {
    riskProfiles: [
        {
            risk_profile: 'BALANCED',
            instruments: [
                {
                    product_id: 1,
                    share_percent: 100,
                    bucket_type: 'INITIAL_CAPITAL',
                },
            ],
        },
    ],
};

const mockGoal = {
    risk_profile: 'BALANCED',
    initial_capital: 100000,
    term_months: 12,
};

const mockRepo = {
    findById: async () => ({
        name: 'Test Product',
        yields: [
            {
                term_from_months: 0,
                term_to_months: 100,
                amount_from: 0,
                amount_to: 1000000,
                yield_percent: 10,
            },
        ],
    }),
};

async function run() {
    console.log('--- Testing BaseCalculator.calculateWeightedYield ---');
    try {
        const result = await calculator.calculateWeightedYield(
            mockPortfolio,
            mockGoal,
            mockRepo
        );
        console.log('Success (Valid Portfolio):', result);
    } catch (e) {
        console.error('Failed (Valid Portfolio):', e);
        process.exit(1);
    }

    // Test Case 2: Undefined riskProfiles (Should throw specific error, not crash)
    console.log('\n--- Testing Undefined riskProfiles ---');
    const badPortfolio = { id: 999 }; // No riskProfiles
    try {
        await calculator.calculateWeightedYield(
            badPortfolio,
            mockGoal,
            mockRepo
        );
        console.error('Failed: Should have thrown error for undefined riskProfiles');
    } catch (e) {
        if (e.message.includes('No risk profiles found')) {
            console.log('Success: Caught expected error:', e.message);
        } else {
            console.error('Failed: Caught unexpected error:', e);
            // process.exit(1); // Don't exit yet, let's see other tests
        }
    }

    // Test Case 3: Empty riskProfiles array
    console.log('\n--- Testing Empty riskProfiles ---');
    const emptyPortfolio = { id: 888, riskProfiles: [] };
    try {
        await calculator.calculateWeightedYield(
            emptyPortfolio,
            mockGoal,
            mockRepo
        );
        console.error('Failed: Should have thrown error for empty riskProfiles');
    } catch (e) {
        if (e.message.includes('No risk profiles found')) {
            console.log('Success: Caught expected error:', e.message);
        } else {
            console.error('Failed: Caught unexpected error:', e);
        }
    }

    console.log('\n--- Verification Complete ---');
}

run();
