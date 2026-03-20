/**
 * Диагностика макроданных: что в БД, сколько записей по индикаторам, диапазоны дат.
 * Запуск: node scripts/debug_macro.js
 */
require('dotenv').config();
const db = require('../src/config/database');

async function run() {
    console.log('=== Макро: что в базе ===\n');

    try {
        const hasIndicators = await db.schema.hasTable('macro_indicators');
        const hasData = await db.schema.hasTable('macro_data');

        if (!hasIndicators || !hasData) {
            console.log('Таблицы macro_indicators или macro_data не найдены. Запусти миграции.');
            process.exit(1);
        }

        const indicators = await db('macro_indicators').select('id', 'slug', 'name', 'is_active').orderBy('slug');
        console.log(`Индикаторов в справочнике: ${indicators.length}\n`);

        let totalRows = 0;
        for (const ind of indicators) {
            const countResult = await db('macro_data')
                .where('indicator_id', ind.id)
                .count('id as cnt')
                .first();
            const count = Number(countResult?.cnt ?? 0);
            totalRows += count;

            let range = '—';
            if (count > 0) {
                const minMax = await db('macro_data')
                    .where('indicator_id', ind.id)
                    .min('date as min_date')
                    .max('date as max_date')
                    .first();
                range = `${minMax.min_date} … ${minMax.max_date}`;
            }

            const status = ind.is_active ? '✓' : '✗';
            console.log(`  ${status} ${ind.slug.padEnd(28)} записей: ${String(count).padStart(5)}   даты: ${range}`);
        }

        console.log('\n--- Итого записей в macro_data:', totalRows);

        // Несколько последних записей по каждому индикатору (чтобы видеть свежесть)
        console.log('\n=== Последние значения по индикаторам ===');
        for (const ind of indicators) {
            const last = await db('macro_data')
                .where('indicator_id', ind.id)
                .orderBy('date', 'desc')
                .limit(3)
                .select('date', 'value');
            if (last.length) {
                const lastDate = last[0].date;
                const vals = last.map(r => `${r.date}=${r.value}`).join(', ');
                console.log(`  ${ind.slug}: последняя дата ${lastDate}, примеры: ${vals}`);
            } else {
                console.log(`  ${ind.slug}: данных нет`);
            }
        }

    } catch (err) {
        console.error('Ошибка:', err.message);
        process.exit(1);
    } finally {
        await db.destroy();
    }
}

run();
