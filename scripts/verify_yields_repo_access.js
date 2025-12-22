require('dotenv').config({ override: true });
const productRepository = require('../src/repositories/productRepository');
const knex = require('../src/config/database');

async function verify() {
    console.log('--- Verifying Product Yields Access ---');
    try {
        const productId = 3;
        console.log(`Fetching product ID ${productId}...`);

        const product = await productRepository.findById(productId);

        if (!product) {
            console.error('Product not found!');
            return;
        }

        console.log(`Product: ${product.name}`);
        console.log('Yields loaded from Repo:', JSON.stringify(product.yields, null, 2));

        // Simulate Calculation Logic
        const term = 240; // 20 years

        // Scenario 1: exact amount for 50% share of 200k
        const allocatedAmount1 = 100000;
        console.log(`\nSimulation 1: Term ${term} mo, Amount ${allocatedAmount1}`);

        const line1 = product.yields.find(l =>
            term >= l.term_from_months &&
            term <= l.term_to_months &&
            allocatedAmount1 >= parseFloat(l.amount_from) &&
            allocatedAmount1 <= parseFloat(l.amount_to)
        );
        console.log('Result 1:', line1 ? `${line1.yield_percent}%` : 'Not Found');

        // Scenario 2: slightly more
        const allocatedAmount2 = 100001;
        console.log(`\nSimulation 2: Term ${term} mo, Amount ${allocatedAmount2}`);

        const line2 = product.yields.find(l =>
            term >= l.term_from_months &&
            term <= l.term_to_months &&
            allocatedAmount2 >= parseFloat(l.amount_from) &&
            allocatedAmount2 <= parseFloat(l.amount_to)
        );
        console.log('Result 2:', line2 ? `${line2.yield_percent}%` : 'Not Found');

        // Scenario 3: slightly less (just in case)
        const allocatedAmount3 = 10;
        console.log(`\nSimulation 3: Term ${term} mo, Amount ${allocatedAmount3}`);
        const line3 = product.yields.find(l =>
            term >= l.term_from_months &&
            term <= l.term_to_months &&
            allocatedAmount3 >= parseFloat(l.amount_from) &&
            allocatedAmount3 <= parseFloat(l.amount_to)
        );
        console.log('Result 3:', line3 ? `${line3.yield_percent}%` : 'Not Found');


    } catch (e) {
        console.error(e);
    } finally {
        await knex.destroy();
    }
}

verify();
