/**
 * Запуск сбора макроданных без сервера — чтобы смотреть логи.
 * node scripts/run_macro_sync.js
 */
require('dotenv').config();
const db = require('../src/config/database');
const macroService = require('../src/services/macroService');
const rosstatService = require('../src/services/rosstatService');

async function run() {
    console.log('🚀 Manual macro sync (direct run)...\n');

    try {
        await macroService.syncImoex();
        await macroService.syncOfzYields();
        await macroService.syncCorpBonds();
        await macroService.fetchCbrKeyRate();
        await macroService.fetchCbrInflation();
        await macroService.fetchCbrDepositRates();
        await macroService.fetchCbrGold();
        await macroService.fetchCbrCurrencyRates();
        await rosstatService.fetchMonthlyInflation();
        await rosstatService.fetchWeeklyInflation();
        console.log('\n✅ Sync finished.');
    } catch (err) {
        console.error('\n❌ Sync failed:', err.message);
    } finally {
        await db.destroy();
        process.exit(0);
    }
}

run();
