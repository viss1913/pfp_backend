const knex = require('../src/config/database');

async function checkTables() {
    try {
        const goalTypes = await knex('goal_types').select('*');
        console.log('--- goal_types ---');
        console.table(goalTypes);

        const portfolioClasses = await knex('portfolio_classes').select('*');
        console.log('--- portfolio_classes ---');
        console.table(portfolioClasses);

        process.exit(0);
    } catch (error) {
        console.error('Error checking tables:', error);
        process.exit(1);
    }
}

checkTables();
