/**
 * Экспорт macro_data + slug для переноса на другой стенд.
 * node scripts/export_macro_data_json.js > macro_data.json
 */
require('dotenv').config();
const db = require('../src/config/database');

async function run() {
    const rows = await db('macro_data as d')
        .join('macro_indicators as i', 'i.id', 'd.indicator_id')
        .select('i.slug', 'd.indicator_id', 'd.date', 'd.value', 'd.source')
        .orderBy(['i.slug', 'd.date']);
    process.stdout.write(JSON.stringify(rows, null, 0));
}

run()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => db.destroy());
