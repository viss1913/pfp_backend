const knex = require('./src/config/database');

async function cleanData() {
    try {
        console.log('Cleaning up constructor_commands...');
        const deletedCount = await knex('constructor_commands')
            .whereIn('id', [1, 2])
            .del();
        console.log(`Deleted ${deletedCount} records.`);
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await knex.destroy();
    }
}

cleanData();
