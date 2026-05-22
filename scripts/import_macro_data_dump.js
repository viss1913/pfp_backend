/**
 * Импорт macro_data с другого стенда (Railway → Immers): дамп только данных, справочник macro_indicators — из миграций.
 *
 * 1) На Railway (или локально с MYSQL_PUBLIC_URL):
 *    mysqldump -h HOST -P PORT -u USER -p --no-create-info --complete-insert DATABASE macro_data > macro_data.sql
 *
 * 2) На Immers:
 *    docker compose exec -T mysql mysql -upfp -pPASS pfp < macro_data.sql
 *
 * Либо JSON-дамп:
 *    node scripts/export_macro_data_json.js > macro_data.json
 *    node scripts/import_macro_data_dump.js macro_data.json
 */
require('dotenv').config();
const fs = require('fs');
const db = require('../src/config/database');

async function run() {
    const file = process.argv[2];
    if (!file || !fs.existsSync(file)) {
        console.error('Usage: node scripts/import_macro_data_dump.js macro_data.json');
        process.exit(1);
    }
    const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(rows) || rows.length === 0) {
        console.error('Empty or invalid JSON array');
        process.exit(1);
    }

    const indicators = await db('macro_indicators').select('id', 'slug');
    const slugToId = Object.fromEntries(indicators.map((i) => [i.slug, i.id]));

    let inserted = 0;
    let skipped = 0;
    for (const row of rows) {
        const slug = row.slug || row.indicator_slug;
        const indicatorId = row.indicator_id || slugToId[slug];
        if (!indicatorId) {
            skipped += 1;
            continue;
        }
        const exists = await db('macro_data')
            .where({ indicator_id: indicatorId, date: row.date })
            .first();
        if (exists) {
            skipped += 1;
            continue;
        }
        await db('macro_data').insert({
            indicator_id: indicatorId,
            date: row.date,
            value: row.value,
            source: row.source || 'import',
        });
        inserted += 1;
    }
    console.log(`Done. inserted=${inserted} skipped=${skipped}`);
}

run()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => db.destroy());
