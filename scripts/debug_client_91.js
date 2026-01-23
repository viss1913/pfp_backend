const knex = require('../src/config/database');
const clientRepository = require('../src/repositories/clientRepository');
const calculationService = require('../src/services/calculationService');

async function debugClient(clientId) {
    try {
        console.log(`--- Debugging Client ${clientId} ---`);
        const fullData = await clientRepository.getFullClientData(clientId);

        // Ensure birth_date is present for age calculation in service
        if (!fullData.birth_date) {
            console.log('[Warn] birth_date missing in DB, using default for calculation...');
            fullData.birth_date = '1985-01-01';
        }

        console.log('\n--- DB GOALS ---');
        console.table(fullData.goals.map(g => ({
            id: g.id,
            name: g.name,
            type: g.goal_type_id,
            target: g.target_amount
            // params: g.params ? JSON.stringify(g.params).substring(0, 50) : null
        })));

        // Preparation for calculateFirstRun
        const calcRequest = {
            client: {
                ...fullData,
                sex: fullData.gender || 'male',
                total_liquid_capital: Number(fullData.total_liquid_capital) || Number(fullData.assets_total) || 0
            },
            goals: fullData.goals
        };

        console.log('\n--- TRIGGERING RECALCULATION ---');
        const calcResult = await calculationService.calculateFirstRun(calcRequest);

        console.log('\n--- CALCULATION RESULT GOALS ---');
        console.table(calcResult.calculation.goals.map(g => ({
            id: g.goal_id,
            name: g.goal_name,
            type_id: g.goal_type_id,
            target: g.summary?.target_amount || g.details?.target_amount || g.summary?.required_capital_future || 'N/A',
            initial_cap: g.summary?.initial_capital || g.details?.initial_capital || 'N/A'
        })));

        console.log('\n--- FULL CALCULATION OBJECT GOALS COUNT:', calcResult.calculation.goals.length);

        process.exit(0);
    } catch (e) {
        console.error('Debug script failed:', e);
        process.exit(1);
    }
}

debugClient(91);
