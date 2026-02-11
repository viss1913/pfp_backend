const knex = require('../src/config/database');

async function debugPrompts() {
    try {
        console.log('--- Bot #5 (ИИ Витя) Config ---');
        const bot = await knex('constructor_bots').where('id', 5).first();
        if (bot) {
            console.log('Name:', bot.name);
            console.log('Base Brain Context:', bot.base_brain_context);
            console.log('Communication Style:', bot.communication_style);
        }

        console.log('\n--- Commands for Bot #5 or Templates ---');
        const commands = await knex('constructor_commands')
            .where('bot_id', 5)
            .orWhere('is_template', true);

        commands.forEach(cmd => {
            console.log(`Command: ${cmd.command}`);
            console.log(`Response Template: ${cmd.response.substring(0, 100)}...`);
            console.log('---');
        });

    } catch (error) {
        console.error('Error debugging prompts:', error);
    } finally {
        process.exit();
    }
}

debugPrompts();
