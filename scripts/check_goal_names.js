const knex = require('../src/config/database');

async function checkNames() {
    try {
        console.log('Goals with goal_type_id = 9:');
        const goals9 = await knex('goals').where({ goal_type_id: 9 }).select('name', 'target_amount');
        console.table(goals9);

        console.log('Goals with goal_type_id = 6:');
        const goals6 = await knex('goals').where({ goal_type_id: 6 }).select('name', 'target_amount');
        console.table(goals6);
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await knex.destroy();
        process.exit();
    }
}

checkNames();
