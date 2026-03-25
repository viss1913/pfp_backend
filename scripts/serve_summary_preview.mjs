/**
 * Локальный просмотр второй страницы отчёта: только preview-default.html.
 * Запуск: node scripts/serve_summary_preview.mjs
 * Или: npm run preview:summary
 * URL: http://127.0.0.1:8765/ (если занят — следующий порт, см. лог). Порт: PREVIEW_SUMMARY_PORT
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const previewPath = path.join(root, 'src/reports/summary/preview-default.html');
const preferredPort = Number(process.env.PREVIEW_SUMMARY_PORT || 8765);

const server = http.createServer((req, res) => {
    const u = req.url?.split('?')[0] || '/';
    if (u === '/' || u === '/preview-default.html' || u === '/preview-default') {
        fs.readFile(previewPath, 'utf8', (err, data) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end(`Cannot read preview: ${err.message}\nPath: ${previewPath}`);
                return;
            }
            res.writeHead(200, {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-store',
            });
            res.end(data);
        });
        return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found. Open /\n');
});

const maxTry = 30;
const fixedPort = Boolean(process.env.PREVIEW_SUMMARY_PORT);

function listenFrom(p, attempt = 0) {
    server.removeAllListeners('error');
    server.once('error', (err) => {
        if (err.code !== 'EADDRINUSE') {
            console.error(err);
            process.exit(1);
        }
        if (fixedPort || attempt >= maxTry) {
            console.error(
                fixedPort
                    ? `Port ${p} already in use (PREVIEW_SUMMARY_PORT). Закрой другой процесс или задай другой порт.`
                    : `Не нашла свободный порт за ${maxTry} попыток.`
            );
            process.exit(1);
        }
        console.warn(`Port ${p} busy, trying ${p + 1}…`);
        server.close(() => listenFrom(p + 1, attempt + 1));
    });
    server.listen(p, () => {
        const addr = server.address();
        const actual = typeof addr === 'object' && addr ? addr.port : p;
        console.log(`Summary preview (preview-default.html): http://127.0.0.1:${actual}/`);
        console.log(`Also: http://localhost:${actual}/`);
    });
}

listenFrom(preferredPort, 0);
