const knex = require('../src/config/database');
const clientRepository = require('../src/repositories/clientRepository');
const calculationService = require('../src/services/calculationService');

async function debugPool(clientId) {
    try {
        const fullData = await clientRepository.getFullClientData(clientId);
        console.log('Client total_liquid_capital:', fullData.total_liquid_capital);
        console.log('Client assets count:', fullData.assets.length);
        
        const context = await calculationService._prepareContext(fullData);
        console.log('\n--- Calculation Context Pool ---');
        console.log('Initial poolBalance:', context.poolBalance);
        console.log('sharedPoolEvents:', JSON.stringify(context.sharedPoolEvents, null, 2));
        
        const totalImmediate = context.sharedPoolEvents
            .filter(e => e.month === 0)
            .reduce((sum, e) => sum + e.amount, 0);
            
        console.log('\nTotal Immediate Liquidity (Month 0):', totalImmediate);
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

debugPool(91);
