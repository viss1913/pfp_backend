require('dotenv').config();
const knex = require('../src/config/database');
const smmService = require('../src/services/smmService');

async function syncAll() {
    console.log('--- Starting Bulk Agent Sync to SMM AI ---');
    try {
        const agents = await knex('agents').select('id', 'first_name', 'last_name');
        console.log(`Found ${agents.length} agents to sync.`);

        for (const agent of agents) {
            console.log(`Syncing agent [${agent.id}] ${agent.first_name || ''} ${agent.last_name || ''}...`);
            const success = await smmService.syncAgent(agent.id);
            if (success) {
                console.log(`  ✅ Success`);
            } else {
                console.log(`  ❌ Failed (check logs)`);
            }
        }

        console.log('--- Sync Completed ---');
    } catch (err) {
        console.error('Error during bulk sync:', err);
    } finally {
        await knex.destroy();
        process.exit(0);
    }
}

syncAll();
