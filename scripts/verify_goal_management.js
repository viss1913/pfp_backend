const clientController = require('../src/controllers/clientController');
const clientService = require('../src/services/clientService');
const knex = require('../src/config/database');

async function verifyGoalManagement() {
    console.log('--- Starting Goal Management Verification ---');

    // Mock user/agent
    const mockUser = { agentId: 1 };
    const mockRes = {
        _status: 200,
        _json: null,
        status(s) { this._status = s; return this; },
        json(j) { this._json = j; return this; }
    };
    const mockNext = (err) => { console.error('Error:', err); };

    let clientId;

    try {
        // 1. Create a Test Client
        console.log('\n1. Creating Test Client...');
        const createReq = {
            user: mockUser,
            body: {
                client: {
                    first_name: 'GoalTest',
                    last_name: 'Client',
                    birth_date: '1985-01-01',
                    sex: 'male',
                    email: `goaltest_${Date.now()}@example.com`,
                    avg_monthly_income: 150000,
                    total_liquid_capital: 1000000 // 1M Pool
                },
                goals: [
                    {
                        goal_type_id: 3, // Investment
                        name: 'Initial Investment',
                        target_amount: 0,
                        term_months: 120,
                        priority: 3,
                        risk_profile: 'BALANCED'
                    }
                ]
            }
        };

        await clientController.firstRun(createReq, mockRes, mockNext);
        const createResult = mockRes._json;
        clientId = createResult.client_id;
        console.log('Client Created ID:', clientId);

        // Helper to extract inner calculation object
        // clientController returns { client_id, calculation: { ... service_result ... } }
        // calculationService returns { ..., calculation: { summary, goals } }
        // So we might have createResult.calculation.calculation.summary

        const getCalcInner = (res) => {
            if (res.calculation && res.calculation.calculation) return res.calculation.calculation;
            if (res.calculation) return res.calculation;
            return null;
        };

        const initialCalc = getCalcInner(createResult);
        if (!initialCalc) {
            console.log('Full Result:', JSON.stringify(createResult, null, 2));
            throw new Error('Could not extract calculation data');
        }

        console.log('Initial Calculation Summary Goals Count:', initialCalc.summary?.goals_count);

        // 2. Add a New Goal (Car)
        console.log('\n2. Adding New Goal (Car)...');
        const addGoalReq = {
            user: mockUser,
            params: { id: clientId },
            body: {
                goal_type_id: 4, // Other/Purchase
                name: 'New Car',
                target_amount: 5000000,
                term_months: 60, // 5 years
                priority: 2, // Higher priority than investment?
                risk_profile: 'CONSERVATIVE'
            }
        };

        // Reset res
        mockRes._json = null;
        await clientController.addGoal(addGoalReq, mockRes, mockNext);
        const addResult = mockRes._json;

        const addCalc = getCalcInner(addResult);
        console.log('Add Goal Result Goals Count:', addCalc?.goals?.length);

        const carGoal = addCalc?.goals?.find(g => g.goal_name === 'New Car');
        console.log('Found New Goal in Calc:', !!carGoal);
        if (carGoal) {
            console.log('Car Goal Details:', JSON.stringify(carGoal.summary || carGoal.details, null, 2));
            console.log('Car Goal Smart Initial Capital:', carGoal.summary?.initial_capital);
        } else {
            console.log('All Goals:', addCalc?.goals?.map(g => g.goal_name));
        }

        // 3. Verify Recalculation (Smart Allocation)
        // Check if Investment goal capital changed?
        const investGoal = addCalc?.goals?.find(g => g.goal_name === 'Initial Investment');
        console.log('Investment Goal Capital:', investGoal?.summary?.initial_capital);


        // 4. Delete the Goal
        console.log('\n3. Deleting Goal (Car)...');
        const carGoalId = carGoal ? carGoal.goal_id : null;
        if (!carGoalId) {
            console.log('Warning: No Goal ID found on calculated goal object, might be missing "id" mapping.');
            // Fallback: fetch goals from DB to find ID if not in calc result (though logic says it should be)
        }

        if (carGoalId) {
            const deleteReq = {
                user: mockUser,
                params: { id: clientId, goalId: carGoalId },
                body: {} // Empty body
            };

            mockRes._json = null;
            await clientController.deleteGoal(deleteReq, mockRes, mockNext);
            const deleteResult = mockRes._json;

            const deleteCalc = getCalcInner(deleteResult);
            console.log('Delete Goal Result Goals Count:', deleteCalc?.goals?.length);
            const deletedCar = deleteCalc?.goals?.find(g => g.goal_name === 'New Car');
            console.log('Car Goal Exists in Calc:', !!deletedCar);
        } else {
            console.log('Skipping delete test due to missing ID');
        }

    } catch (e) {
        console.error('Test Failed:', e);
    } finally {
        // Cleanup
        if (clientId) {
            console.log('\nCleaning up client...');
            await clientService.updateClient(clientId, { email: `deleted_${Date.now()}_${clientId}` }); // Soft delete or just leave it
        }
        process.exit();
    }
}

verifyGoalManagement();
