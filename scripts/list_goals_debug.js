const knex = require('../src/config/database');

async function listGoals(clientId) {
    try {
        console.log(`Fetching goals for client ${clientId}...`);
        const goals = await knex('goals').where({ client_id: clientId }).select('id', 'name', 'goal_type_id', 'target_amount');
        console.table(goals);
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

listGoals(91);
