
require('dotenv').config();
const knex = require('../src/config/database');

async function seed2024() {
    try {
        console.log('Seeding 2024 Rates...');

        // Check if exists
        const exists = await knex('tax_income_rates').where('tax_year', 2024).first();
        if (exists) {
            console.log('2024 rates already exist.');
            return;
        }

        const rates2024 = [
            { tax_year: 2024, income_from: 0, income_to: 5000000, rate: 13.00, order_index: 1, description: 'до 5 млн' },
            { tax_year: 2024, income_from: 5000001, income_to: 99999999999, rate: 15.00, order_index: 2, description: 'свыше 5 млн' },
        ];

        await knex('tax_income_rates').insert(rates2024);
        console.log('✅ 2024 Rates inserted.');
    } catch (e) {
        console.error(e);
    } finally {
        await knex.destroy();
    }
}

seed2024();
