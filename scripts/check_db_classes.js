require('dotenv').config({ override: true });
const knex = require('../src/config/database');

async function checkClasses() {
    try {
        console.log('--- Portfolio Classes in DB ---');
        const classes = await knex('portfolio_classes').select('*');
        if (classes.length === 0) {
            console.log('No classes found.');
        } else {
            classes.forEach(c => {
                console.log(`[${c.id}] Code: ${c.code}, Name: ${c.name}`);
            });
        }
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkClasses();
