/**
 * Скачать PDF отчёта с API (прод/стенд).
 *
 *   PFP_BASE=https://pfpbackend-production.up.railway.app
 *   PFP_TEST_EMAIL=...
 *   PFP_TEST_PASSWORD=...
 *   PFP_CLIENT_ID=369
 *   node scripts/fetch_report_pdf.js
 *
 * Файл: tmp/report-client-{id}.pdf (рядом с корнем при запуске из репо)
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE = process.env.PFP_BASE || 'https://pfpbackend-production.up.railway.app';
const email = process.env.PFP_TEST_EMAIL;
const password = process.env.PFP_TEST_PASSWORD;
const clientId = process.env.PFP_CLIENT_ID || '369';
const outDir = path.join(__dirname, '..', 'tmp');
const outPath = path.join(outDir, `report-client-${clientId}.pdf`);

const httpsAgent = new https.Agent({
    keepAlive: true,
    timeout: 120000,
});

async function main() {
    if (!email || !password) {
        console.error('Задай PFP_TEST_EMAIL и PFP_TEST_PASSWORD');
        process.exit(1);
    }
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const login = await axios.post(
        `${BASE}/api/auth/login`,
        { email, password },
        { timeout: 90000, httpsAgent }
    );
    const token = login.data.token;
    const url = `${BASE}/api/pfp/reports/${clientId}/pdf?includeCover=1&includeSummary=1&disposition=attachment`;
    const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'arraybuffer',
        timeout: 300000,
        httpsAgent,
        validateStatus: () => true,
    });
    if (res.status !== 200) {
        console.error('HTTP', res.status, res.headers['content-type']);
        try {
            console.error(JSON.stringify(JSON.parse(Buffer.from(res.data).toString('utf8')), null, 2));
        } catch {
            console.error(Buffer.from(res.data).toString('utf8').slice(0, 800));
        }
        process.exit(1);
    }
    fs.writeFileSync(outPath, Buffer.from(res.data));
    console.log('Saved:', outPath, fs.statSync(outPath).size, 'bytes');
}

main().catch((e) => {
    console.error(e.response?.status, e.code || '', e.message);
    process.exit(1);
});
