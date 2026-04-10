require('dotenv').config({ override: true });
const knex = require('../src/config/database');
const calculationService = require('../src/services/calculationService');

async function main() {
    const clientId = Number(process.argv[2] || 543);
    try {
        const client = await knex('clients').where({ id: clientId }).first();
        if (!client) {
            console.error(`Client ${clientId} not found`);
            process.exit(1);
        }

        const goals = await knex('goals').where({ client_id: clientId });
        const assets = await knex('client_assets').where({ client_id: clientId });

        if (!goals.length) {
            console.error(`Client ${clientId} has no goals`);
            process.exit(1);
        }

        const request = {
            client: {
                ...client,
                project_id: client.project_id,
                sex: client.sex || client.gender,
                birth_date: client.birth_date,
                avg_monthly_income: Number(client.avg_monthly_income || 0),
                total_liquid_capital: Number(client.total_liquid_capital || 0),
                assets
            },
            goals: goals.map((goal) => ({
                ...goal,
                id: goal.id,
                goal_id: goal.id
            }))
        };

        const result = await calculationService.calculateFirstRun(
            request,
            null,
            null,
            { isFirstRun: true, usePool: true }
        );

        const goalResults = result.goals || [];
        const failed = goalResults.filter(g => g.error);

        console.log(`Client ${clientId} goals total: ${goalResults.length}`);
        if (failed.length === 0) {
            console.log('OK: no goal errors');
        } else {
            console.log(`FAILED goals: ${failed.length}`);
            failed.forEach((g) => {
                console.log(`- goal_id=${g.goal_id || g.id} type=${g.goal_type_id} name=${g.name}: ${g.error}`);
            });
        }
    } catch (e) {
        console.error('Verification failed:', e.message);
        process.exitCode = 1;
    } finally {
        await knex.destroy();
    }
}

main();
