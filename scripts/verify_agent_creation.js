require('dotenv').config({ override: true });
const knex = require('../src/config/database');
const agentService = require('../src/services/agentService');
const bcrypt = require('bcryptjs');

async function verifyAgentCreation() {
    console.log('--- STARTING AGENT CREATION VERIFICATION ---');
    const TEST_EMAIL = 'verify_agent_' + Date.now() + '@example.com';
    const TEST_PASSWORD = 'password123';
    let createdAgentId = null;

    try {
        console.log(`1. Creating agent with email: ${TEST_EMAIL}...`);
        const agentData = {
            first_name: 'Verification',
            last_name: 'Test',
            email: TEST_EMAIL,
            password: TEST_PASSWORD,
            telegram_bot: 'VerifyBot',
            telegram_channel: '@VerifyChannel',
            is_active: true
        };

        const agent = await agentService.createAgent(agentData);
        createdAgentId = agent.id;
        console.log(`✅ Agent profile created with ID: ${createdAgentId}`);
        console.log('✅ Name:', agent.first_name, agent.last_name);
        console.log('✅ Telegram Bot:', agent.telegram_bot);
        console.log('✅ Telegram Channel:', agent.telegram_channel);
        console.log('✅ Email in agent object (from join):', agent.email);

        console.log('2. Checking users table for this agent...');
        const user = await knex('users').where({ agent_id: createdAgentId }).first();

        if (user) {
            console.log('✅ User record found in database.');
            console.log('✅ User email:', user.email);
            console.log('✅ User role:', user.role);

            const isPasswordValid = await bcrypt.compare(TEST_PASSWORD, user.password_hash);
            if (isPasswordValid) {
                console.log('✅ Password hash is correct and valid.');
            } else {
                console.error('❌ Password hash mismatch!');
            }
        } else {
            console.error('❌ User record NOT found in database!');
        }

        console.log('3. Testing updateAgent (changing password and bot)...');
        const NEW_PASSWORD = 'new_password_456';
        const updated = await agentService.updateAgent(createdAgentId, {
            password: NEW_PASSWORD,
            telegram_bot: 'NewBotName'
        });

        console.log('✅ Updated Agent Bot:', updated.telegram_bot);
        const updatedUser = await knex('users').where({ agent_id: createdAgentId }).first();
        const isNewPasswordValid = await bcrypt.compare(NEW_PASSWORD, updatedUser.password_hash);
        if (isNewPasswordValid) {
            console.log('✅ New password hash is valid.');
        } else {
            console.error('❌ New password hash mismatch!');
        }

    } catch (error) {
        console.error('❌ Verification Error:', error);
    } finally {
        if (createdAgentId) {
            console.log('Cleaning up...');
            // Order matters if there are FKs, though 'users' has CASCADE
            await knex('users').where({ agent_id: createdAgentId }).del();
            await knex('agents').where({ id: createdAgentId }).del();
        }
        await knex.destroy();
        console.log('Done.');
    }
}

verifyAgentCreation();
