/**
 * Тест: POST /api/pfp/pdf-settings/cover-background (поле image).
 *
 * 1) Скопируй `test-pdf-cover-config.example.json` → `test-pdf-cover-config.local.json`
 *    (local.json в .gitignore — туда token и apiUrl).
 * 2) apiUrl — только хост, БЕЗ `/api` на конце:
 *    https://pfpbackend-production.up.railway.app
 * 3) Запуск: `node scripts/test_pdf_cover_upload.mjs`
 *
 * Переопределение через env (имеют приоритет):
 *   API_URL, AGENT_JWT, JWT, X_PROJECT_KEY, IMAGE_PATH
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const localConfigPath = path.join(__dirname, 'test-pdf-cover-config.local.json');

function normalizeApiUrl(raw) {
    let u = String(raw || '').trim().replace(/\/+$/, '');
    if (u.endsWith('/api')) {
        u = u.slice(0, -4).replace(/\/+$/, '');
    }
    return u || 'http://localhost:3000';
}

let fileCfg = {};
if (fs.existsSync(localConfigPath)) {
    try {
        fileCfg = JSON.parse(fs.readFileSync(localConfigPath, 'utf8'));
    } catch (e) {
        console.error('Не удалось прочитать', localConfigPath, e.message);
        process.exit(1);
    }
}

const API_URL = normalizeApiUrl(process.env.API_URL || fileCfg.apiUrl);
let token = process.env.AGENT_JWT || process.env.JWT || fileCfg.token || '';
if (token && !token.startsWith('Bearer ')) {
    token = `Bearer ${token}`;
}
const projectKey = process.env.X_PROJECT_KEY || fileCfg.xProjectKey || '';
const imagePath = process.env.IMAGE_PATH
    ? path.resolve(process.env.IMAGE_PATH)
    : path.join(root, 'assets/reports/rostech/cover-background.jpg');

if (!token || token === 'Bearer ') {
    console.error(
        'Нет токена: задай AGENT_JWT или поле token в test-pdf-cover-config.local.json'
    );
    process.exit(1);
}

if (!fs.existsSync(imagePath)) {
    console.error('Файл не найден:', imagePath);
    process.exit(1);
}

const ext = path.extname(imagePath).toLowerCase();
const mime =
    ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
const buf = fs.readFileSync(imagePath);
const blob = new Blob([buf], { type: mime });
const form = new FormData();
form.append('image', blob, path.basename(imagePath));

const headers = { Authorization: token };
if (projectKey) {
    headers['x-project-key'] = projectKey;
}

const url = `${API_URL}/api/pfp/pdf-settings/cover-background`;
console.log('POST', url);
console.log('image:', imagePath, `(${buf.length} bytes)`);

const res = await fetch(url, { method: 'POST', headers, body: form });
const text = await res.text();
let json;
try {
    json = JSON.parse(text);
} catch {
    json = text;
}

console.log('Status:', res.status);
console.log(typeof json === 'string' ? json : JSON.stringify(json, null, 2));

if (res.ok && json && json.url) {
    console.log('\nOK — url в настройках:', json.url);
}

process.exit(res.ok ? 0 : 1);
