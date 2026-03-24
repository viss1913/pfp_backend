/**
 * Заливает статические картинки карточек целей (assets/reports/goal-cards/*) в R2
 * под префиксом pdf-report-goal-cards/ — те же ключи, что в API pdf_summary_layout и HTML-сводной.
 *
 * Требует .env: R2_* + публичная база (R2_PUBLIC_BASE_URL и т.д.), см. docs/env-cloudflare-r2.md
 *
 * Запуск: npm run seed:pdf-goal-cards-r2
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { uploadPublicFile, isR2ClientReady, isR2PublicUrlReady } = require('../src/utils/r2Client');
const { GOAL_CARDS_DIR, GOAL_CARDS_R2_PREFIX } = require('../src/reports/summary/buildSummaryOverviewHtml');

const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function mimeForExt(ext) {
    const e = ext.toLowerCase();
    if (e === '.png') return 'image/png';
    if (e === '.webp') return 'image/webp';
    return 'image/jpeg';
}

async function main() {
    const root = path.join(__dirname, '..');
    const dir = path.join(root, GOAL_CARDS_DIR);

    if (!fs.existsSync(dir)) {
        console.error('Нет папки:', dir);
        process.exit(1);
    }

    if (!isR2ClientReady() || !isR2PublicUrlReady()) {
        console.error('R2 не сконфигурирован (нужны ключи + R2_PUBLIC_BASE_URL / R2_CDN_BASE_URL / R2_PUBLIC_DOMAIN)');
        process.exit(1);
    }

    const names = fs.readdirSync(dir).filter((n) => {
        const ext = path.extname(n).toLowerCase();
        return ALLOWED_EXT.has(ext) && n !== 'README.txt';
    });

    if (!names.length) {
        console.error('Нет изображений в', dir);
        process.exit(1);
    }

    let ok = 0;
    let fail = 0;

    for (const name of names.sort()) {
        const abs = path.join(dir, name);
        const stat = fs.statSync(abs);
        if (!stat.isFile()) continue;

        const key = `${GOAL_CARDS_R2_PREFIX}/${name}`;
        const buf = fs.readFileSync(abs);
        const contentType = mimeForExt(path.extname(name));

        process.stdout.write(`Put ${key} (${buf.length} B) … `);
        const up = await uploadPublicFile({ key, body: buf, contentType });
        if (!up.ok) {
            console.log('FAIL', up.reason, up.detail || '');
            fail++;
            continue;
        }
        console.log(up.url);
        ok++;
    }

    console.log(`\nГотово: ${ok} загружено, ${fail} ошибок. Фронт/бэк используют public_url из pdf_summary_layout при наличии CDN.`);
    process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
