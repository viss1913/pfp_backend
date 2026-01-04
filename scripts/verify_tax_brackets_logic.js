require('dotenv').config({ override: true }); // Ensure .env is loaded
const TaxService = require('../src/services/TaxService');
const knex = require('../src/config/database');

async function verify() {
    try {
        console.log('--- 1. Checking DB Brackets ---');
        const brackets = await knex('tax_2ndfl_brackets').orderBy('order_index', 'asc');
        console.table(brackets.map(b => ({
            id: b.id,
            range: `${b.income_from} - ${b.income_to}`,
            rate: b.rate + '%'
        })));

        if (brackets.length === 0) {
            console.warn('⚠️ No brackets found in DB! TaxService uses 13% default.');
        }

        console.log('\n--- 2. Testing Calculation Logic ---');

        // Test Case 1: 3,000,000 Income (Should hit 13% and 15%)
        // 2,400,000 * 0.13 = 312,000
        // 600,000 * 0.15 = 90,000
        // Total = 402,000
        const testIncome1 = 3000000;
        const res1 = await TaxService.calculateNdfl(testIncome1, 2025);
        console.log(`Income: ${testIncome1}`);
        console.log(`Calculated Tax: ${res1.taxAmount}`);
        console.log(`Expected Tax: 402000`);
        console.log(`Difference: ${res1.taxAmount - 402000}`);
        console.log('Brackets Used:', JSON.stringify(res1.brackets, null, 2));

        // Test Case 2: 7,000,000 Income (Should hit 13%, 15%, 18%)
        // 2.4M * 0.13 = 312,000
        // 2.6M * 0.15 = 390,000 (up to 5M)
        // 2.0M * 0.18 = 360,000 (7M - 5M)
        // Total = 1,062,000
        const testIncome2 = 7000000;
        const res2 = await TaxService.calculateNdfl(testIncome2, 2025);
        console.log(`\nIncome: ${testIncome2}`);
        console.log(`Calculated Tax: ${res2.taxAmount}`);
        console.log(`Expected Tax: 1062000`);
        console.log(`Difference: ${res2.taxAmount - 1062000}`);

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await knex.destroy();
    }
}

verify();
