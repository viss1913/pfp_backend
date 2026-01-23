const knex = require('../src/config/database');
const clientController = require('../src/controllers/clientController');
const clientService = require('../src/services/clientService');

async function repairClient(clientId, agentId) {
    try {
        console.log(`--- REPAIRING CLIENT ${clientId} ---`);

        // 1. Check and fix birth_date if missing
        const client = await knex('clients').where({ id: clientId }).first();
        if (!client.birth_date) {
            console.log('Fixing birth_date...');
            await knex('clients').where({ id: clientId }).update({ birth_date: '1982-12-31' });
        }

        // 2. PURGE STALE PARAMS from all goals
        // This is the "Nuclear Option" to fix the data shift
        console.log('Purging stale params from goals to fix data shift...');
        await knex('goals')
            .where({ client_id: clientId })
            .update({ params: null });

        // 3. Trigger RECALCULATE via Controller to sync goals_summary
        console.log('Triggering full recalculation and sync...');
        const mockReq = {
            user: { agentId: agentId },
            params: { id: clientId },
            body: { goals: null }
        };

        const mockRes = {
            _status: 200,
            _json: null,
            status(s) { this._status = s; return this; },
            json(j) { this._json = j; return this; }
        };

        const mockNext = (e) => {
            if (e) console.error('Recalc Error:', e.message || e);
        };

        // This call will now automatically save the new calculation to goals_summary 
        // because of the fix I just made in clientController.recalculate
        await clientController.recalculate(mockReq, mockRes, mockNext);

        if (mockRes._json) {
            console.log('--- REPAIR SUCCESS ---');
            console.log('Goals in list:', mockRes._json.calculation.summary.goals_count);
            mockRes._json.calculation.goals.forEach(g => {
                const target = g.summary?.target_amount || g.summary?.required_capital_future || g.details?.target_amount || 'N/A';
                console.log(`- Goal: ${g.goal_name.padEnd(20)} | Target: ${String(target).padEnd(10)} | ID: ${g.goal_id}`);
            });
            console.log('\nUI should now be perfectly in sync.');
        } else {
            console.error('FAILED: Calculation returned no data.');
        }

    } catch (e) {
        console.error('Critical Repair Failure:', e);
    } finally {
        await knex.destroy();
        process.exit(0);
    }
}

// Client 91 belongs to agent 10001
repairClient(91, 10001);
