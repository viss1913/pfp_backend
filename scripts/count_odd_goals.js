const knex = require('../src/config/database');

async function countOddGoals() {
    try {
        console.log('Searching for goals with goal_type_id = 9...');
        const count = await knex('goals').where({ goal_type_id: 9 }).count('id as count');
        console.log(`Found ${count[0].count} goals with ID 9.`);

        const allTypes = await knex('goals').distinct('goal_type_id').select('goal_type_id');
        console.log('All unique goal_type_ids in database:', allTypes.map(t => t.goal_type_id));
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await knex.destroy();
        process.exit();
    }
}

countOddGoals();
