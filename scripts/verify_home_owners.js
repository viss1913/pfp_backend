const HomeOwnersCalculator = require('../src/services/calculators/HomeOwnersCalculator');
const knex = require('../src/config/database');

async function test() {
    console.log('🧪 Testing Home Owners Calculation...');

    try {
        const testParams = {
            product_id: 1,
            object_params: {
                object_type: 'apartment',
                wall_material: 'wood',
                security: 'alarm',
                is_rented: 'no'
            },
            limits: {
                property: 1000000,
                civil: 500000
            }
        };

        const result = await HomeOwnersCalculator.calculate(testParams);
        console.log('✅ Calculation Result:', JSON.stringify(result, null, 2));

        // Wait to make sure output is visible if needed
        if (result.total_premium === 3645) {
            console.log('💎 Calculation is correct! (1.5M * 0.0015 * 1.8 * 0.9 = 3645)');
        } else {
            console.warn('⚠️ Calculation result differs from manual estimate, check logic.');
        }

    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        await knex.destroy();
    }
}

test();
