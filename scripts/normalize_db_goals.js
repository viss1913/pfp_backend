const knex = require('../src/config/database');

async function normalizeGoalTypes() {
    try {
        console.log('Normalizing goal_type_ids: changing 9 and 6 to 4...');

        const updatedCount = await knex('goals')
            .whereIn('goal_type_id', [6, 9])
            .update({ goal_type_id: 4 });

        console.log(`Success! ${updatedCount} goals updated to goal_type_id: 4.`);
    } catch (error) {
        console.error('Error during normalization:', error.message);
    } finally {
        await knex.destroy();
        process.exit();
    }
}

normalizeGoalTypes();
