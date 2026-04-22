/**
 * Импорт рекомендованных стратегий Comon в БД (полный JSON по каждой строке).
 *
 *   node scripts/import_comon_recommended_strategies.js [path/to.json]
 *
 * Формат файла: массив, или { "data": [...] }, или { "items": [...] }.
 * Заменяет весь каталог в таблице comon_recommended_strategies.
 */
const fs = require('fs');
const path = require('path');
const db = require('../src/config/database');

function extractItems(parsed) {
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.data)) return parsed.data;
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.items)) return parsed.items;
    throw new Error('JSON must be an array, or { data: [] }, or { items: [] }');
}

async function main() {
    const fileArg = process.argv[2];
    const file = fileArg
        ? path.resolve(process.cwd(), fileArg)
        : path.join(process.cwd(), 'data', 'comonRecommendedStrategies.json');

    if (!fs.existsSync(file)) {
        console.error('File not found:', file);
        process.exit(1);
    }

    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    const items = extractItems(parsed);

    const rows = items
        .map((item, i) => {
            const id = item && item.id != null ? Number(item.id) : NaN;
            if (!Number.isFinite(id)) return null;
            return {
                comon_strategy_id: id,
                payload: item,
                sort_order: i,
                is_active: true,
                created_at: new Date(),
                updated_at: new Date(),
            };
        })
        .filter(Boolean);

    await db.transaction(async (trx) => {
        await trx('comon_recommended_strategies').del();
        if (rows.length > 0) {
            await trx.batchInsert('comon_recommended_strategies', rows, 50);
        }
    });

    console.log('OK: imported', rows.length, 'rows from', file);
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
