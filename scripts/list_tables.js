const knex = require('../src/config/database');

async function listTables() {
    try {
        const tables = await knex.raw('SHOW TABLES');
        console.log('--- Database Tables ---');
        console.log(JSON.stringify(tables[0], null, 2));

        const dbName = await knex.raw('SELECT DATABASE()');
        console.log('--- Current Database ---');
        console.log(dbName[0][0]['DATABASE()']);

        process.exit(0);
    } catch (error) {
        console.error('Error listing tables:', error);
        process.exit(1);
    }
}

listTables();
