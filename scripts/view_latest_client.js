require('dotenv').config({ override: true });
const knex = require('../src/config/database');

async function viewLatestClient() {
    try {
        console.log('--- Connecting to Database... ---');

        // 1. Get the most recently created client
        const client = await knex('clients')
            .orderBy('created_at', 'desc')
            .first();

        if (!client) {
            console.log('❌ No clients found in the database.');
            return;
        }

        console.log(`\n✅ Found Latest Client (ID: ${client.id}):`);
        console.log(`   Name: ${client.first_name} ${client.last_name}`);
        console.log(`   Email: ${client.email}`);
        console.log(`   Net Worth: ${client.net_worth}`);
        console.log('---------------------------------------------------');

        // 2. Get related assets
        const assets = await knex('client_assets').where({ client_id: client.id });
        console.log(`\n💰 Assets (${assets.length}):`);
        assets.forEach(a => {
            console.log(`   - [${a.type}] ${a.name}: ${a.current_value} ${a.currency}`);
        });

        // 3. Get related liabilities
        const liabilities = await knex('client_liabilities').where({ client_id: client.id });
        console.log(`\n📉 Liabilities (${liabilities.length}):`);
        liabilities.forEach(l => {
            console.log(`   - [${l.type}] ${l.name}: ${l.remaining_amount} RUB (${l.monthly_payment}/mo)`);
        });

        // 4. Get goals (if any were saved during calculation, though typically calculation runs don't save to 'goals' table yet unless explicit)
        // Check if we have entries in 'goals' table or just 'goals_summary' in client
        const goals = await knex('goals').where({ client_id: client.id });
        console.log(`\n🎯 Detalied Goals in DB (${goals.length}):`);
        goals.forEach(g => {
            console.log(`   - ${g.name}: ${g.target_amount}`);
        });

        if (client.goals_summary) {
            console.log(`\n📝 Goals Summary (JSON):`);
            console.log(JSON.stringify(client.goals_summary, null, 2));
        }

    } catch (error) {
        console.error('Error fetching data:', error);
    } finally {
        process.exit();
    }
}

viewLatestClient();
