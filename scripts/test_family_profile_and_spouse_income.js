require('dotenv').config({ override: true });
const knex = require('../src/config/database');
const clientController = require('../src/controllers/clientController');

function makeMockRes() {
    return {
        statusCode: 200,
        payload: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.payload = data;
            return this;
        }
    };
}

async function run() {
    console.log('--- TEST: family_profile array + spouse income persistence ---');
    try {
        const project = await knex('projects').select('id').first();
        if (!project) throw new Error('No projects found in DB');
        const projectId = Number(project.id);
        console.log(`Using project_id=${projectId}`);

        const uniqueTs = Date.now();
        const reqFirstRun = {
            projectId,
            user: { projectId, agentId: null },
            body: {
                client: {
                    first_name: 'FP',
                    last_name: `Test_${uniqueTs}`,
                    birth_date: '1990-01-01',
                    sex: 'female',
                    email: `fp_test_${uniqueTs}@example.com`,
                    avg_monthly_income: 150000,
                    spouse_avg_monthly_income: 120000,
                    family_profile: [
                        {
                            marital_status: 'married',
                            children: [
                                { first_name: 'Kid', birth_date: '2018-03-10' }
                            ]
                        }
                    ]
                },
                goals: [
                    {
                        goal_type_id: 3,
                        name: 'Smoke investment goal',
                        target_amount: 500000,
                        term_months: 24,
                        risk_profile: 'BALANCED'
                    }
                ]
            }
        };

        const resFirstRun = makeMockRes();
        await clientController.firstRun(reqFirstRun, resFirstRun, (e) => {
            if (e) throw e;
        });

        if (resFirstRun.statusCode >= 400) {
            throw new Error(`firstRun failed: ${JSON.stringify(resFirstRun.payload)}`);
        }
        const clientId = resFirstRun.payload?.client_id;
        if (!clientId) throw new Error('firstRun returned no client_id');
        console.log(`firstRun OK, client_id=${clientId}`);

        const reqGet = {
            params: { id: String(clientId) },
            projectId,
            user: { projectId },
            query: {},
            route: { path: '/:id' }
        };
        const resGet = makeMockRes();
        await clientController.get(reqGet, resGet, (e) => {
            if (e) throw e;
        });
        if (resGet.statusCode >= 400) {
            throw new Error(`get failed: ${JSON.stringify(resGet.payload)}`);
        }

        const card = resGet.payload || {};
        const familyProfile = card.family_profile;
        const spouseIncome = card.spouse_avg_monthly_income;

        const familyOk = Array.isArray(familyProfile) && familyProfile.length > 0;
        const spouseOk = Number(spouseIncome) === 120000;

        console.log(`family_profile returned as array: ${familyOk ? 'YES' : 'NO'}`);
        console.log(`spouse_avg_monthly_income returned: ${spouseIncome} (${spouseOk ? 'OK' : 'MISMATCH'})`);

        if (!familyOk || !spouseOk) {
            throw new Error('Persistence/readback check failed');
        }

        console.log('--- RESULT: PASS ---');
    } catch (err) {
        console.error('--- RESULT: FAIL ---');
        console.error(err.message);
        process.exitCode = 1;
    } finally {
        await knex.destroy();
    }
}

run();
