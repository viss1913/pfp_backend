const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE = process.env.PFP_BASE || 'https://pfpbackend-production.up.railway.app';
const email = process.env.PFP_TEST_EMAIL || 'vissarovav2408@yandex.ru';
const password = process.env.PFP_TEST_PASSWORD || '123456';

async function main() {
    const loginRes = await axios.post(`${BASE}/api/auth/login`, { email, password }, { timeout: 60000 });
    const token = loginRes.data?.token;
    if (!token) throw new Error('No token from login');

    const payload = {
        client: {
            project_id: 22,
            first_name: 'София',
            last_name: 'Пенсионная',
            middle_name: '',
            birth_date: '1996-01-01',
            gender: 'female',
            avg_monthly_income: 90000,
            total_liquid_capital: 10000,
            phone: '+70000000000',
        },
        goals: [
            {
                goal_type_id: 1,
                name: 'Достойная пенсия',
                risk_profile: 'BALANCED',
                inflation_rate: 5.6,
                desired_monthly_income: 80000,
                target_amount: 80000,
                initial_capital: 10000,
                term_months: 120,
            },
        ],
        assets: [
            {
                type: 'CASH',
                name: 'Наличные',
                current_value: 10000,
                currency: 'RUB',
                start_date: '2026-04-01',
                risk_level: 'conservative',
            },
        ],
        liabilities: [],
        expenses: [],
    };

    const calcRes = await axios.post(`${BASE}/api/client/first-run`, payload, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 120000,
    });

    const clientId = calcRes.data?.client_id || calcRes.data?.calculation?.client_id;
    if (!clientId) {
        throw new Error(`client_id not found in response: ${JSON.stringify(Object.keys(calcRes.data || {}))}`);
    }

    const reportRes = await axios.get(`${BASE}/api/pfp/reports/${clientId}`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 120000,
    });

    const pdfRes = await axios.get(`${BASE}/api/pfp/reports/${clientId}/pdf?includeCover=1&includeSummary=1`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'arraybuffer',
        timeout: 300000,
    });

    const outDir = path.join(__dirname);
    const calcJsonPath = path.join(outDir, `first-run-response-client-${clientId}.json`);
    fs.writeFileSync(calcJsonPath, JSON.stringify(calcRes.data, null, 2), 'utf8');
    const reportJsonPath = path.join(outDir, `report-client-${clientId}.json`);
    fs.writeFileSync(reportJsonPath, JSON.stringify(reportRes.data, null, 2), 'utf8');
    const outPath = path.join(outDir, `pension-rostech-client-${clientId}.pdf`);
    fs.writeFileSync(outPath, Buffer.from(pdfRes.data));

    console.log(JSON.stringify({
        base: BASE,
        clientId,
        firstRunJsonPath: calcJsonPath,
        reportJsonPath,
        pdfPath: outPath,
        pdfBytes: Buffer.byteLength(Buffer.from(pdfRes.data)),
        goalsCount: calcRes.data?.goals?.length || calcRes.data?.calculation?.goals?.length || null,
    }, null, 2));
}

main().catch((e) => {
    const status = e.response?.status;
    const data = e.response?.data;
    console.error('TEST_FAILED', status || '', e.message);
    if (data) {
        try {
            if (Buffer.isBuffer(data)) {
                console.error(data.toString('utf8').slice(0, 1000));
            } else {
                console.error(JSON.stringify(data, null, 2));
            }
        } catch (_) {}
    }
    process.exit(1);
});

