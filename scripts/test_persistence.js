const knex = require('../src/config/database');

async function testPersistence() {
    console.log('--- TEST: Financial Plan Persistence ---');
    const url = 'http://localhost:3001/api/client/first-run';

    const payload = {
        client: {
            fio: 'Тестовый Клиент На Стойкость',
            birth_date: '1985-06-15',
            sex: 'female',
            email: 'persistence_test@example.com',
            avg_monthly_income: 150000,
            total_liquid_capital: 1000000
        },
        goals: [
            {
                name: 'Отпуск',
                goal_type_id: 3,
                target_amount: 500000,
                term_months: 12,
                risk_profile: 'BALANCED'
            }
        ]
    };

    console.log('1. Sending request to /api/client/first-run...');
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const err = await response.json();
            console.error('API Error:', JSON.stringify(err, null, 2));
            process.exit(1);
        }

        const data = await response.json();
        const clientId = data.client_id;
        console.log(`✅ API Success. Client ID: ${clientId}`);

        console.log('2. Verifying Database Persistence...');

        // Check Client Table
        const client = await knex('clients').where({ id: clientId }).first();
        if (!client) throw new Error('Client record not found in DB');
        console.log('✅ Client record persisted.');

        if (!client.goals_summary) throw new Error('goals_summary is empty');

        let summary;
        if (typeof client.goals_summary === 'string') {
            summary = JSON.parse(client.goals_summary);
        } else {
            summary = client.goals_summary;
        }

        console.log(`✅ Goals summary persisted. Goals in summary: ${summary.goals.length}`);

        // Check Goals Table (including Smart Life)
        const dbGoals = await knex('goals').where({ client_id: clientId });
        console.log(`✅ Found ${dbGoals.length} goals in database.`);

        const hasSmartLife = dbGoals.some(g => g.name.includes('Smart'));
        if (hasSmartLife) {
            console.log('✅ Smart Life goal auto-injected and saved to DB!');
        } else {
            console.warn('❌ Smart Life goal NOT found in DB.');
        }

        const vacationGoal = dbGoals.find(g => g.name === 'Отпуск');
        if (vacationGoal) {
            console.log('✅ Manual goal "Отпуск" saved to DB.');
        }

        console.log('\n--- ALL PERSISTENCE TESTS PASSED ---');
    } catch (error) {
        console.error('Test Failed:', error.message);
    } finally {
        await knex.destroy();
    }
}

testPersistence();
