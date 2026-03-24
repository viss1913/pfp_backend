/**
 * Статический снимок сводной страницы по умолчанию (без настроек агента).
 * Запуск: node scripts/render_summary_preview_default.mjs
 * Открой src/reports/summary/preview-default.html в браузере (ассеты вшиты data:, как в ЛК).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const modUrl = pathToFileURL(path.join(root, 'src/reports/summary/buildSummaryOverviewHtml.js')).href;
const { buildReportSummaryOverviewHtml } = await import(modUrl);
const mock = JSON.parse(
    fs.readFileSync(path.join(root, 'src/reports/summary/previewMockPayload.json'), 'utf8')
);

const html = buildReportSummaryOverviewHtml({
    reportPayload: mock,
    clientInfo: {
        name: 'Алексей Петров',
        age: '37',
        income: '280 000 ₽',
        currentCapital: '1 617 000 ₽',
    },
    inlineLocalAssets: true,
});

const out = path.join(root, 'src/reports/summary/preview-default.html');
fs.writeFileSync(out, html, 'utf8');
console.log('Written:', out);
