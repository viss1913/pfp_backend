/**
 * Проверка загрузки ИПЦ г/г из Excel ЦБ (UniDbQuery 132934).
 * node scripts/test_cbr_inflation_yoy_excel.js
 */
require('dotenv').config();
const macroService = require('../src/services/macroService');
const { runCbrInflationYoySync } = require('../src/services/macroInflationSyncNotifyService');
const db = require('../src/config/database');

async function run() {
    const { saved } = await runCbrInflationYoySync('script:test_cbr_inflation_yoy_excel');
    const history = await macroService.getHistory('russia_cpi_inflation_yoy');
    const tail = (history || []).slice(-5);
    console.log('\nSaved:', saved);
    console.log('Last 5 points:', tail.map((r) => `${r.date}=${r.value}`).join(', '));
    await db.destroy();
    process.exit(0);
}

run().catch((e) => {
    console.error(e);
    process.exit(1);
});
