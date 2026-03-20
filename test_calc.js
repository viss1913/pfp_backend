const db = require('./src/config/database');
const calculationService = require('./src/services/calculationService');

async function test() {
    try {
        const projectId = 6;
        const clientIds = [230, 231];

        for (const clientId of clientIds) {
            const client = await db('clients').where({ id: clientId }).first();
            const goals = await db('goals').where({ client_id: clientId });

            console.log(`\n--- Testing for Client ${clientId}, Project ${projectId} ---`);
            console.log(`Goals found: ${goals.length}`);

            const data = {
                projectId: projectId,
                client_id: clientId,
                client: client,
                goals: goals
            };

            try {
                const result = await calculationService.calculateFirstRun(data);
                console.log(`Calculation Success for ${clientId}`);
                // console.log(JSON.stringify(result, null, 2));
            } catch (e) {
                console.error(`Calculation FAILED for ${clientId}:`, e.message);
                console.error(e.stack);
            }
        }

        process.exit(0);
    } catch (err) {
        console.error('--- Test Script Error ---');
        console.error(err);
        process.exit(1);
    }
}

test();
