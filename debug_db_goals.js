const db = require('./src/config/database');

async function check() {
    try {
        const client231Goals = await db('goals').where({ client_id: 231 });
        console.log('--- Goals for Client 231 ---');
        console.log(JSON.stringify(client231Goals, null, 2));

        const client230Goals = await db('goals').where({ client_id: 230 });
        console.log('\n--- Goals for Client 230 ---');
        console.log(JSON.stringify(client230Goals, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
