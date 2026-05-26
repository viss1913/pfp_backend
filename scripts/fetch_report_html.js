/**
 * Скачать финальный HTML отчета (как в прод PDF-пайплайне: после appliers).
 *
 * Пример:
 *   PFP_BASE=https://pfpbackend-production.up.railway.app
 *   PFP_TEST_EMAIL=...
 *   PFP_TEST_PASSWORD=...
 *   PFP_CLIENT_ID=369
 *   node scripts/fetch_report_html.js
 *
 * Результат:
 *   tmp/report-client-{id}-final.html
 *   tmp/report-client-{id}-pages/page-XX.html
 *   tmp/report-client-{id}-toc.json
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE = process.env.PFP_BASE || 'https://pfpbackend-production.up.railway.app';
const email = process.env.PFP_TEST_EMAIL;
const password = process.env.PFP_TEST_PASSWORD;
const clientId = process.env.PFP_CLIENT_ID || '369';
const includeCover = process.env.PFP_INCLUDE_COVER ?? '1';
const includeSummary = process.env.PFP_INCLUDE_SUMMARY ?? '1';
const goalTypes = process.env.PFP_GOAL_TYPES || '';

const outDir = path.join(__dirname, '..', 'tmp');
const outHtmlPath = path.join(outDir, `report-client-${clientId}-final.html`);
const outPagesDir = path.join(outDir, `report-client-${clientId}-pages`);
const outTocPath = path.join(outDir, `report-client-${clientId}-toc.json`);

const httpsAgent = new https.Agent({
    keepAlive: true,
    timeout: 120000,
});

function buildUrl() {
    const params = new URLSearchParams();
    params.set('includeCover', includeCover);
    params.set('includeSummary', includeSummary);
    params.set('includePages', '1');
    if (goalTypes.trim()) params.set('goalTypes', goalTypes.trim());
    return `${BASE}/api/pfp/reports/${clientId}/html?${params.toString()}`;
}

async function loginAndGetToken() {
    if (!email || !password) {
        throw new Error('Задай PFP_TEST_EMAIL и PFP_TEST_PASSWORD');
    }
    const login = await axios.post(
        `${BASE}/api/auth/login`,
        { email, password },
        { timeout: 90000, httpsAgent }
    );
    return login.data.token;
}

function ensureOutDirs() {
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    if (!fs.existsSync(outPagesDir)) fs.mkdirSync(outPagesDir, { recursive: true });
}

function writePages(pages) {
    if (!Array.isArray(pages)) return 0;
    let count = 0;
    pages.forEach((pageHtml, idx) => {
        const num = String(idx + 1).padStart(2, '0');
        const filePath = path.join(outPagesDir, `page-${num}.html`);
        fs.writeFileSync(filePath, String(pageHtml || ''), 'utf8');
        count += 1;
    });
    return count;
}

async function main() {
    ensureOutDirs();
    const token = await loginAndGetToken();
    const url = buildUrl();
    const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 300000,
        httpsAgent,
        validateStatus: () => true,
    });

    if (res.status !== 200) {
        console.error('HTTP', res.status, res.headers['content-type']);
        console.error(JSON.stringify(res.data, null, 2));
        process.exit(1);
    }

    const payload = res.data || {};
    fs.writeFileSync(outHtmlPath, String(payload.html || ''), 'utf8');
    fs.writeFileSync(outTocPath, JSON.stringify(payload.toc || [], null, 2), 'utf8');
    const pagesCount = writePages(payload.pages);

    console.log('Saved final merged HTML:', outHtmlPath);
    console.log('Saved pages:', pagesCount, '->', outPagesDir);
    console.log('Saved TOC:', outTocPath);
    console.log('');
    console.log('Tip: open this file in browser ->', outHtmlPath);
}

main().catch((e) => {
    console.error(e.response?.status, e.code || '', e.message);
    process.exit(1);
});

