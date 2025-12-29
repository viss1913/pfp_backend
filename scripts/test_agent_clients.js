require('dotenv').config({ override: true });
const knex = require('../src/config/database');
const clientController = require('../src/controllers/clientController');
const clientRepository = require('../src/repositories/clientRepository');

async function testAgentClients() {
    console.log('--- STARTING AGENT CLIENT LIST TEST ---');
    const AGENT_ID = 999; // Test Agent
    let agentCreated = false;

    try {
        // 1. Ensure Agent Exists (to satisfy FK)
        const agentExists = await knex('agents').where({ id: AGENT_ID }).first();
        if (!agentExists) {
            console.log(`Creating test agent with ID ${AGENT_ID}...`);
            await knex('agents').insert({
                id: AGENT_ID
            });
            agentCreated = true;
        }

        console.log(`2. Seeding a test client for Agent ${AGENT_ID}...`);
        await knex('clients').insert({
            first_name: 'AgentUser',
            last_name: 'Test',
            agent_id: AGENT_ID
        });

        // MOCK REQUEST for listByAgent
        const req = {
            user: { agentId: AGENT_ID }, // Authenticated Agent
            query: { limit: 5 }
        };

        // MOCK RESPONSE
        let responsePayload = null;
        const res = {
            statusCode: 200,
            status: function (code) {
                this.statusCode = code;
                return this;
            },
            json: function (payload) {
                this.data = payload;
                responsePayload = payload;
                return this;
            }
        };

        const next = (err) => {
            console.error('❌ Controller Error:', err);
        };

        console.log('3. Calling clientController.listByAgent()...');
        await clientController.listByAgent(req, res, next);

        if (res.statusCode >= 400) {
            console.error('❌ Request Failed:', responsePayload);
            return;
        }

        console.log('✅ Request Successful!');

        if (responsePayload && responsePayload.data && Array.isArray(responsePayload.data)) {
            console.log(`✅ Received ${responsePayload.data.length} clients.`);
            const found = responsePayload.data.find(c => c.agent_id === AGENT_ID);
            if (found) {
                console.log('✅ Found seeded client in response:', found.first_name, found.last_name);
            } else {
                console.error('❌ Seeded client NOT found in response!');
            }
        } else {
            console.error('❌ Invalid response structure:', responsePayload);
        }

    } catch (error) {
        console.error('❌ Unexpected Test Error:', error);
    } finally {
        // Cleanup
        await knex('clients').where({ agent_id: AGENT_ID }).del();
        if (agentCreated) {
            await knex('agents').where({ id: AGENT_ID }).del();
        }
        await knex.destroy();
    }
}

testAgentClients();
