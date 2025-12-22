require('dotenv').config({ override: true });
const knex = require('../src/config/database');

async function inspect() {
    console.log('--- Inspecting Portfolios Table Schema ---');
    try {
        const columns = await knex('portfolios').columnInfo();
        console.log(Object.keys(columns));
    } catch (e) {
        console.error(e);
    } finally {
        await knex.destroy();
    }
}

inspect();
