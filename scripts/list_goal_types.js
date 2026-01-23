const knex = require('../src/config/database');

async function listGoalTypes() {
    try {
        console.log('Fetching goal types from database...');
        const types = await knex('goal_types').select('*');
        console.table(types);
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await knex.destroy();
        process.exit();
    }
}

listGoalTypes();
