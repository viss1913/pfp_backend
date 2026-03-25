/**
 * Заливает в Cloudflare R2 стоковые ассеты для превью сводной страницы:
 * - assets/reports/summary/stock-logo.png
 * - assets/reports/summary/stock-ai-avatar.png
 * - assets/fonts/Roboto-Regular.ttf
 *
 * Ключи: pdf-report-summary-stock-assets/<basename>
 * Префикс должен совпадать с SUMMARY_STOCK_ASSETS_R2_PREFIX в buildSummaryOverviewHtml.js
 *
 * Требует .env: R2_* как у бэка + публичный base URL (R2_PUBLIC_BASE_URL / R2_CDN_BASE_URL / R2_PUBLIC_DOMAIN).
 * Запуск: npm run seed:pdf-summary-stock-assets-r2
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { uploadPublicFile, isR2ClientReady, isR2PublicUrlReady } = require('../src/utils/r2Client');

const SUMMARY_STOCK_ASSETS_R2_PREFIX = 'pdf-report-summary-stock-assets';

const root = path.join(__dirname, '..');
const candidates = [
    path.join(root, 'assets/reports/summary/stock-logo.png'),
    path.join(root, 'assets/reports/summary/stock-ai-avatar.png'),
    path.join(root, 'assets/fonts/Roboto-Regular.ttf'),
];

async function main() {
    if (!isR2ClientReady() || !isR2PublicUrlReady()) {
        console.error('R2 не сконфигурирован (см. docs/env-cloudflare-r2.md)');
        process.exit(1);
    }

    let ok = 0;
    let fail = 0;

    for (const absPath of candidates) {
        if (!fs.existsSync(absPath)) {
            console.error('Нет файла:', absPath);
            fail++;
            continue;
        }

        const basename = path.basename(absPath);
        const key = `${SUMMARY_STOCK_ASSETS_R2_PREFIX}/${basename}`;
        const buf = fs.readFileSync(absPath);
        const ext = path.extname(absPath).toLowerCase();
        const contentType =
            ext === '.png'
                ? 'image/png'
                : ext === '.ttf'
                  ? 'font/ttf'
                  : 'application/octet-stream';

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

    console.log(`\nГотово: ${ok} загружено, ${fail} ошибок.`);
    process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

