require('dotenv').config({ override: true });
const knex = require('../src/config/database');
const clientService = require('../src/services/clientService');
const calculationService = require('../src/services/calculationService');
const clientController = require('../src/controllers/clientController');

async function verifySimplification() {
    console.log('--- STARTING VERIFICATION: RESPONSE SIMPLIFICATION ---');

    try {
        // 1. Прямая проверка метода simplify
        console.log('\n[1] Testing calculationService.simplify...');
        const mockResult = {
            goals: [
                {
                    goal_id: 1,
                    goal_type: 'PENSION',
                    goal_name: 'My Pension',
                    details: {
                        yearly_breakdown: [{ year: 2025, amount: 100 }]
                    }
                }
            ]
        };

        const simplified = calculationService.simplify(JSON.parse(JSON.stringify(mockResult)));
        const goal = simplified.goals[0];
        const keys = Object.keys(goal);

        console.log('Goal keys order:', keys.slice(0, 4));
        if (keys[0] === 'goal_name' && keys[1] === 'goal_type' && keys[2] === 'goal_type_id') {
            console.log('✅ Success: Field order is correct (goal_name first).');
        } else {
            console.log('❌ Failure: Field order is incorrect.');
        }

        if (goal.details && !goal.details.yearly_breakdown) {
            console.log('✅ Success: yearly_breakdown was removed.');
        } else {
            console.log('❌ Failure: yearly_breakdown is still present.');
        }

        // 2. Интеграционный тест через контроллер (имитация API)
        console.log('\n[2] Testing clientController.firstRun (API integration)...');
        const mockReq = {
            body: {
                client: { birth_date: '1980-01-01', sex: 'M', avg_monthly_income: 150000, total_liquid_capital: 1000000 },
                goals: [{ goal_type_id: 1, name: 'Test Pension', target_amount: 200000, risk_profile: 'BALANCED' }]
            },
            user: { agentId: 1 }
        };

        let responseData = null;
        const mockRes = {
            status: function () { return this; },
            json: function (data) { responseData = data; return this; }
        };

        await clientController.firstRun(mockReq, mockRes, (err) => { if (err) throw err; });

        if (responseData && responseData.goals && responseData.goals[0]) {
            const apiGoal = responseData.goals[0];
            if (!apiGoal.details.yearly_breakdown) {
                console.log('✅ Success: API response does NOT contain yearly_breakdown.');
            } else {
                console.log('❌ Failure: API response still contains yearly_breakdown.');
            }
            console.log('API Goal first field:', Object.keys(apiGoal)[0]);
        }

        // 3. Проверка того, что в БД данные остались ПОЛНЫМИ
        console.log('\n[3] Verifying database persistence (snapshot stays complete)...');
        const clientId = responseData.client_id;
        console.log('Looking for Client ID in DB:', clientId);

        if (!clientId) {
            throw new Error('responseData.client_id is missing/null');
        }

        const dbClient = await clientService.getFullClient(clientId);

        const summaryInDb = dbClient.goals_summary;
        if (summaryInDb && summaryInDb.goals && summaryInDb.goals[0].details.yearly_breakdown) {
            console.log('✅ Success: Database snapshot still contains yearly_breakdown (needed for reports).');
        } else {
            console.log('❌ Failure: Database snapshot is missing yearly_breakdown.');
        }

        // Cleanup
        await knex('clients').where({ id: clientId }).del();
        console.log('\n--- VERIFICATION COMPLETED ---');

    } catch (error) {
        console.error('❌ Verification failed:', error);
    } finally {
        await knex.destroy();
    }
}

verifySimplification();
