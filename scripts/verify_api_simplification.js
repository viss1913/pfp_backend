require('dotenv').config({ override: true });
const knex = require('../src/config/database');
const clientService = require('../src/services/clientService');
const CalculationService = require('../src/services/calculationService');
const ClientController = require('../src/controllers/clientController');

async function verifyApiSimplification() {
    console.log('--- STARTING VERIFICATION: API SIMPLIFICATION (SINGLE GOAL UPDATE) ---');

    try {
        // 1. Create a dummy client and goal
        const clientData = {
            fio: 'Test API Simplification',
            avg_monthly_income: 100000,
            goals: [
                {
                    goal_type_id: 4, // CAR
                    name: 'Test Car',
                    target_amount: 1000000,
                    term_months: 24,
                    risk_profile: 'BALANCED'
                }
            ]
        };

        const clientId = await clientService.createFullClient(clientData);
        const fullClient = await clientService.getFullClient(clientId);
        const goalId = fullClient.goals[0].id;

        console.log(`Created client ${clientId} with goal ${goalId} (Target: 1,000,000)`);

        // 2. Mock Request for recalculate using the NEW simplified format
        const mockReq = {
            params: { id: clientId },
            user: { agentId: fullClient.agent_id },
            body: {
                goal_id: goalId,
                target_amount: 1500000 // NEW TARGET
            }
        };

        const mockRes = {
            status: function (s) { this.statusCode = s; return this; },
            json: function (data) { this.data = data; return this; }
        };

        const mockNext = (err) => { if (err) console.error('Next called with error:', err); };

        console.log('\n[TEST] Calling recalculate with simplified payload: { goal_id, target_amount }');
        await ClientController.recalculate(mockReq, mockRes, mockNext);

        const result = mockRes.data;
        const updatedGoal = result.goals.find(g => g.goal_id === goalId);

        console.log(`Updated Goal Target Amount: ${updatedGoal.summary.target_amount_initial}`);

        if (updatedGoal.summary.target_amount_initial === 1500000) {
            console.log('✅ Success: Recalculate correctly handled single goal update in root body.');
        } else {
            console.log('❌ Failure: Recalculate did not update the goal target amount correctly.');
        }

        // 3. Clean up (Optional)
        // await knex('clients').where('id', clientId).del();

    } catch (error) {
        console.error('❌ Error during verification:', error);
    } finally {
        await knex.destroy();
    }
}

verifyApiSimplification();
