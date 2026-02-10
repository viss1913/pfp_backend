const knex = require('../src/config/database');

async function activateBots() {
    try {
        const affectedRows = await knex('constructor_bots')
            .whereIn('id', [5, 6]) // Активируем ИИ Витя и Савелий
            .update({ is_active: 1 });

        console.log(`Successfully activated ${affectedRows} bots.`);

        const bots = await knex('constructor_bots').whereIn('id', [5, 6]);
        bots.forEach(bot => {
            console.log(`Bot: ${bot.name}, Active: ${bot.is_active}`);
        });

    } catch (error) {
        console.error('Error activating bots:', error);
    } finally {
        process.exit();
    }
}

activateBots();
