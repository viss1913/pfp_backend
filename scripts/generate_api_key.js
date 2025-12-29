require('dotenv').config({ override: true });
const knex = require('../src/config/database');
const apiKeyService = require('../src/services/apiKeyService');

async function generateKey() {
    try {
        const agentId = process.argv[2];
        const keyName = process.argv[3] || 'Default Key';

        if (!agentId) {
            console.error('Usage: node scripts/generate_api_key.js <agent_id> [key_name]');
            process.exit(1);
        }

        // Verify agent exists
        const agent = await knex('agents').where('id', agentId).first();
        // If agent table is empty or agent not found, let's warn but maybe create if forced? 
        // Better to check.
        if (!agent) {
            console.log(`⚠️ Agent with ID ${agentId} not found. Creating a dummy agent for testing...`);
            await knex('agents').insert({ id: agentId, created_at: new Date() }).onConflict('id').ignore();
        }

        console.log(`Generating API Key for Agent ID: ${agentId} (${keyName})...`);

        const result = await apiKeyService.generateKey(agentId, keyName);

        console.log('\n✅ API Key Generated Successfully!');
        console.log('------------------------------------------------');
        console.log(`Agent ID:  ${result.id}`);
        console.log(`Key Name:  ${keyName}`);
        console.log(`Prefix:    ${result.prefix}`);
        console.log(`API KEY:   ${result.key}`);
        console.log('------------------------------------------------');
        console.log('⚠️  SAVE THIS KEY NOW. It will not be shown again.');

    } catch (error) {
        console.error('❌ Error generating key:', error);
    } finally {
        await knex.destroy();
    }
}

generateKey();
