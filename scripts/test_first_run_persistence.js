require('dotenv').config({ override: true });
const knex = require('../src/config/database');
const clientController = require('../src/controllers/clientController');
const clientRepository = require('../src/repositories/clientRepository');

async function testFirstRunpersistence() {
    console.log('--- STARTING FIRST RUN PERSISTENCE TEST ---');

    // MOCK REQUEST
    const req = {
        user: { id: 1 }, // Mock Agent ID (if auth used)
        body: {
            client: {
                first_name: 'TestPersist',
                last_name: 'Client_' + Date.now(),
                birth_date: '1990-01-01',
                sex: 'male',
                avg_monthly_income: 100000,
                email: `test_persist_${Date.now()}@example.com`
            },
            goals: [
                {
                    goal_type_id: 1,
                    name: 'Test Pension Goal',
                    target_amount: 50000,
                    risk_profile: 'BALANCED'
                }
            ]
        }
    };

    // MOCK RESPONSE
    const res = {
        statusCode: 200,
        data: null,
        status: function (code) {
            this.statusCode = code;
            return this;
        },
        json: function (payload) {
            this.data = payload;
            return this;
        }
    };

    const next = (err) => {
        console.error('❌ Controller Error:', err);
    };

    try {
        console.log('1. Calling clientController.firstRun()...');
        await clientController.firstRun(req, res, next);

        if (res.statusCode >= 400) {
            console.error('❌ Request Failed:', res.data);
            return;
        }

        console.log('✅ Request Successful!');
        const result = res.data;
        console.log('Response Payload:', JSON.stringify(result, null, 2));

        if (!result.client_id) {
            console.error('❌ No client_id returned!');
            return;
        }

        console.log(`\n2. Verifying DB Record for Client ID: ${result.client_id}...`);
        const dbClient = await clientRepository.findById(result.client_id);

        if (!dbClient) {
            console.error('❌ Client record not found in DB!');
            return;
        }

        console.log('✅ Client record found.');

        if (!dbClient.goals_summary) {
            console.error('❌ goals_summary column is NULL or EMPTY!');
        } else {
            console.log('✅ goals_summary is verified present.');
            // console.log('Summary content:', JSON.stringify(dbClient.goals_summary).substring(0, 100) + '...');
        }

    } catch (error) {
        console.error('❌ Unexpected Test Error:', error);
    } finally {
        await knex.destroy();
    }
}

testFirstRunpersistence();
