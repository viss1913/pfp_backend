const HomeOwnersCalculator = require('../src/services/calculators/HomeOwnersCalculator');
const knex = require('../src/config/database');

async function test() {
    console.log('🧪 Testing Home Owners Calculation with Base Rates in Product...');

    try {
        const product = await knex('insurance_home_owners_products').first();
        if (!product) {
            console.error('❌ No product found. Run seed first.');
            process.exit(1);
        }

        console.log(`Using product: ${product.name} (ID: ${product.id})`);
        console.log(`Base Rates: Constructive=${product.rate_constructive}, Finish=${product.rate_finish}, Property=${product.rate_property}, Civil=${product.rate_civil}`);

        const testParams = {
            product_id: product.id,
            object_params: {
                wall_material: 'wood' // Multiplier 1.8
            },
            limits: {
                constructive: 1000000,
                finish: 500000,
                property: 300000,
                civil: 500000
            }
        };

        const result = await HomeOwnersCalculator.calculate(testParams);

        console.log('--- Results ---');
        console.log('Input Limits:', testParams.limits);
        console.log('Total Premium:', result.total_premium);
        console.log('Calculation Steps:', JSON.stringify(result.calculation_steps, null, 2));

        // Manual check calculation:
        // Base = (1000000 * 0.0012) + (500000 * 0.0025) + (300000 * 0.0035) + (500000 * 0.0010)
        // Base = 1200 + 1250 + 1050 + 500 = 4000
        // Wood Multiplier = 1.8
        // Expected = 4000 * 1.8 = 7200

        if (result.total_premium === 7200) {
            console.log('✅ Success! Calculation matches expected value.');
        } else {
            console.log(`❌ Mismatch! Expected 7200, got ${result.total_premium}`);
        }

    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        await knex.destroy();
    }
}

test();
