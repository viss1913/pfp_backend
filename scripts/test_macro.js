const macroService = require('../src/services/macroService');
const { runCbrInflationYoySync } = require('../src/services/macroInflationSyncNotifyService');
const db = require('../src/config/database');

async function testMacro() {
    try {
        console.log('🚀 Starting Macro Sync Test...');

        console.log('\n1. Syncing IMOEX (MOEX)...');
        await macroService.syncImoex();

        console.log('\n2. Syncing OFZ Yields (MOEX)...');
        await macroService.syncOfzYields();

        console.log('\n3. Syncing Corporate Bonds (MOEX)...');
        await macroService.syncCorpBonds();

        console.log('\n4. Syncing Key Rate (CBR SOAP)...');
        await macroService.fetchCbrKeyRate();

        console.log('\n5. Syncing inflation YoY (CBR Excel)...');
        await runCbrInflationYoySync('script:test_macro');

        console.log('\n6. Syncing Deposit Rates (CBR HTML)...');
        await macroService.fetchCbrDepositRates();

        console.log('\n📊 Final Data in DB:');
        const latest = await macroService.getLatestValues();
        console.table(latest);

        process.exit(0);
    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

testMacro();
