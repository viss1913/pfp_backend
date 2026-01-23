const knex = require('../src/config/database');

async function checkGoal() {
    try {
        const goalId = 246;
        console.log(`Checking goal ID: ${goalId} in the database...`);

        const goal = await knex('goals').where({ id: goalId }).first();

        if (goal) {
            console.log('--- Goal Found ---');
            console.log(JSON.stringify(goal, null, 2));
        } else {
            console.log('--- Goal NOT Found ---');
        }
    } catch (error) {
        console.error('Error connecting to database:', error.message);
    } finally {
        await knex.destroy();
        process.exit();
    }
}

checkGoal();
