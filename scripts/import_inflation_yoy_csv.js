/**
 * Импорт ряда инфляции г/г из scripts/data/inflation_10y.csv
 * Формат строки: MM.YYYY;значение (запятая как десятичный разделитель).
 * Дата в БД — последний календарный день месяца.
 *
 * Usage: node scripts/import_inflation_yoy_csv.js [path/to.csv]
 * Перезалить с нуля: node scripts/import_inflation_yoy_csv.js --fresh
 */
const fs = require('fs');
const path = require('path');
const macroService = require('../src/services/macroService');
const db = require('../src/config/database');

const DEFAULT_SLUG = 'russia_cpi_inflation_yoy';
const DEFAULT_CSV = path.join(__dirname, 'data', 'inflation_10y.csv');

/** Последний день календарного месяца (1–12) в UTC, чтобы toISOString() в macroService не сдвигал дату */
function lastDayOfMonth(year, month1to12) {
    return new Date(Date.UTC(year, month1to12, 0, 12, 0, 0));
}

function parseLine(line) {
    const trimmed = line.trim();
    const semi = trimmed.indexOf(';');
    if (semi === -1) return null;
    const period = trimmed.slice(0, semi).trim().replace(/\s/g, '');
    const valRaw = trimmed.slice(semi + 1).trim().replace(/\s/g, '').replace(',', '.');
    const m = /^(\d{2})\.(\d{4})$/.exec(period);
    if (!m) return null;
    const mm = parseInt(m[1], 10);
    const yyyy = parseInt(m[2], 10);
    if (mm < 1 || mm > 12) return null;
    const value = parseFloat(valRaw);
    if (Number.isNaN(value)) return null;
    return { date: lastDayOfMonth(yyyy, mm), value, raw: trimmed };
}

async function run() {
    const args = process.argv.slice(2).filter((a) => a !== '--fresh');
    const fresh = process.argv.includes('--fresh');
    const csvPath = path.resolve(args[0] && !args[0].startsWith('-') ? args[0] : DEFAULT_CSV);
    const slug = process.env.MACRO_IMPORT_SLUG || DEFAULT_SLUG;

    if (!fs.existsSync(csvPath)) {
        console.error(`Файл не найден: ${csvPath}`);
        process.exit(1);
    }

    if (fresh) {
        const ind = await db('macro_indicators').where({ slug }).first();
        if (ind) {
            const del = await db('macro_data').where({ indicator_id: ind.id }).del();
            console.log(`--fresh: удалено строк macro_data: ${del}`);
        }
    }

    const text = fs.readFileSync(csvPath, 'utf8');
    const lines = text.split(/\r?\n/);
    let n = 0;
    for (const line of lines) {
        const parsed = parseLine(line);
        if (!parsed) continue;
        await macroService.saveIndicatorValue(slug, parsed.value, parsed.date, {
            source: path.relative(process.cwd(), csvPath),
            period: parsed.raw.split(';')[0]
        });
        n += 1;
    }

    console.log(`Готово: импортировано ${n} точек в slug "${slug}" из ${csvPath}`);
    process.exit(0);
}

run().catch((e) => {
    console.error(e);
    process.exit(1);
});
