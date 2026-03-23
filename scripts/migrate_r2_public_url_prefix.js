/**
 * Массово заменить старый публичный префикс R2 в сохранённых URL (БД),
 * после смены R2_PUBLIC_BASE_URL / R2_PUBLIC_DOMAIN на другой pub-….r2.dev.
 *
 * В .env сначала выставь НОВЫЙ публичный домен (как в дашборде R2 для этого бакета).
 *
 * Обязательно:
 *   R2_PUBLIC_URL_REPLACE_FROM — старый префикс, напр. https://pub-f7e229b86c1940fabdcf50f072f1013a.r2.dev
 *
 * Целевой префикс: R2_PUBLIC_URL_REPLACE_TO или первый из R2_PUBLIC_* (r2Client).
 *
 * DRY_RUN=1 — только печать, без UPDATE.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const knex = require('../src/config/database');
const { getPublicBaseCandidates } = require('../src/utils/r2Client');

function normBase(u) {
    if (!u || typeof u !== 'string') return '';
    return u.trim().replace(/\/+$/, '');
}

async function rewriteColumn(table, column, from, to, dry) {
    const rows = await knex(table).where(column, 'like', `${from}%`).select('id', column);
    let n = 0;
    for (const row of rows) {
        const oldVal = row[column];
        if (typeof oldVal !== 'string' || !oldVal.startsWith(from)) continue;
        const newVal = to + oldVal.slice(from.length);
        if (dry) {
            console.log(`  [dry] id=${row.id} …${oldVal.slice(-60)}`);
        } else {
            const patch = { [column]: newVal };
            if (await knex.schema.hasColumn(table, 'updated_at')) {
                patch.updated_at = knex.fn.now();
            }
            await knex(table).where({ id: row.id }).update(patch);
        }
        n++;
    }
    return n;
}

async function main() {
    const from = normBase(process.env.R2_PUBLIC_URL_REPLACE_FROM);
    if (!from) {
        console.error('Задай R2_PUBLIC_URL_REPLACE_FROM (старый https://pub-….r2.dev без слэша в конце)');
        process.exit(1);
    }

    let to = normBase(process.env.R2_PUBLIC_URL_REPLACE_TO);
    if (!to) {
        const bases = getPublicBaseCandidates();
        to = bases[0] || '';
    }
    if (!to) {
        console.error(
            'Нет целевого префикса: задай R2_PUBLIC_URL_REPLACE_TO или R2_PUBLIC_BASE_URL / R2_PUBLIC_DOMAIN в .env'
        );
        process.exit(1);
    }

    if (from === to) {
        console.log('FROM и TO совпадают, нечего делать.');
        await knex.destroy();
        process.exit(0);
    }

    const dry = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
    console.log('Замена префикса:');
    console.log('  FROM', from);
    console.log('  TO  ', to);
    console.log(dry ? '  (DRY_RUN — без записи в БД)\n' : '\n');

    const targets = [
        { table: 'agent_report_pdf_settings', column: 'cover_background_url' },
        { table: 'agent_report_pdf_settings', column: 'summary_logo_url' },
        { table: 'agent_report_pdf_settings', column: 'summary_background_url' },
        { table: 'agent_report_pdf_settings', column: 'summary_ai_avatar_url' },
        { table: 'ai_b2c_settings', column: 'avatar_url' },
    ];

    for (const { table, column } of targets) {
        if (!(await knex.schema.hasTable(table))) {
            console.log(`Пропуск: нет таблицы ${table}`);
            continue;
        }
        if (!(await knex.schema.hasColumn(table, column))) {
            console.log(`Пропуск: нет колонки ${table}.${column}`);
            continue;
        }
        const n = await rewriteColumn(table, column, from, to, dry);
        console.log(`${table}.${column}: ${dry ? 'затронуло бы' : 'обновлено'} ${n} строк`);
    }

    await knex.destroy();
    console.log('\nГотово.');
}

main().catch(async (e) => {
    console.error(e);
    try {
        await knex.destroy();
    } catch (_) {}
    process.exit(1);
});
