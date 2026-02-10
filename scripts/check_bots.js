const knex = require('../src/config/database');

async function checkBots() {
    try {
        const bots = await knex('constructor_bots').select('*');
        console.log('--- Constructor Bots Status ---');
        if (bots.length === 0) {
            console.log('No bots found in database.');
        } else {
            bots.forEach(bot => {
                console.log(`ID: ${bot.id}, Name: ${bot.name}, Active: ${bot.is_active}, Link: ${bot.link}, Token (prefix): ${bot.token ? bot.token.substring(0, 10) + '...' : 'NONE'}`);
            });
        }

        const commands = await knex('constructor_commands').count('* as count').first();
        console.log(`Total commands/templates: ${commands.count}`);

        const clients = await knex('constructor_clients').count('* as count').first();
        console.log(`Total clients: ${clients.count}`);

    } catch (error) {
        console.error('Error checking bots:', error);
    } finally {
        process.exit();
    }
}

checkBots();
