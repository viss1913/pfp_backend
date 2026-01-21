const knex = require('../src/config/database');

async function findClient() {
    try {
        // Find clients who have goals
        const clientsWithGoals = await knex('goals')
            .distinct('client_id')
            .limit(10);

        const clientIds = clientsWithGoals.map(c => c.client_id);

        for (const id of clientIds) {
            const client = await knex('clients').where({ id }).first();
            const goals = await knex('goals').where({ client_id: id });

            console.log(`Client ID: ${id}`);
            console.log(`- Name: ${client.first_name} ${client.last_name}`);
            console.log(`- Goals Count: ${goals.length}`);
            console.log(`- Goals Summary (Type): ${typeof client.goals_summary}`);
            console.log(`- Goals Summary (Length): ${client.goals_summary ? client.goals_summary.length : 0}`);
            console.log('-----------------------------------');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await knex.destroy();
    }
}

findClient();
