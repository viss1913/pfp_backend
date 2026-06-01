/**
 * Smoke: PUT /api/pfp/clients/:id — частичное редактирование карточки.
 *
 * Env: TEST_API_KEY или JWT via TEST_AGENT_EMAIL + TEST_AGENT_PASSWORD (если есть login helper).
 * По умолчанию: x-api-key + BASE_URL=http://localhost:3000
 */
require('dotenv').config({ override: true });
const axios = require('axios');

const API_KEY = process.env.TEST_API_KEY || process.env.SMOKE_API_KEY;
const BASE_URL = process.env.BASE_URL || process.env.SMOKE_BASE_URL || 'http://localhost:3000';

if (!API_KEY) {
    console.error('Set TEST_API_KEY or SMOKE_API_KEY in .env');
    process.exit(1);
}

const client = axios.create({
    baseURL: BASE_URL,
    headers: { 'x-api-key': API_KEY },
});

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

async function run() {
    console.log('--- 1. first-run: create client ---');
    const originalFirst = 'SmokePatchИмя';
    const originalLast = 'SmokePatchФам';
    const createRes = await client.post('/api/client/first-run', {
        goals: [{ goal_type_id: 1, name: 'Patch smoke goal', target_amount: 100000, risk_profile: 'BALANCED' }],
        client: {
            first_name: originalFirst,
            last_name: originalLast,
            phone: '79990001122',
            birth_date: '1985-03-15',
            sex: 'male',
        },
    });
    const clientId = createRes.data.client_id;
    assert(clientId, 'client_id missing');
    console.log('client_id:', clientId);

    console.log('--- 2. PUT only phone (pfp route) ---');
    const newPhone = '70001112233';
    await client.put(`/api/pfp/clients/${clientId}`, {
        client: { phone: newPhone },
    });

    const afterPhone = await client.get(`/api/pfp/clients/${clientId}/plans`);
    assert(afterPhone.data.phone === newPhone, 'phone not updated');
    assert(afterPhone.data.first_name === originalFirst, 'first_name was wiped');
    assert(afterPhone.data.last_name === originalLast, 'last_name was wiped');
    console.log('OK: partial phone, FIO preserved');

    console.log('--- 3. PUT family_profile ---');
    await client.put(`/api/pfp/clients/${clientId}`, {
        client: {
            family_profile: {
                marital_status: 'married',
                real_estate: [
                    { name: 'Квартира', estimated_value: 12000000, status: 'mortgage' },
                ],
            },
        },
    });
    const afterFamily = await client.get(`/api/pfp/clients/${clientId}/plans`);
    const fp = afterFamily.data.family_profile;
    assert(fp && fp.marital_status === 'married', 'family_profile.marital_status');
    assert(Array.isArray(fp.real_estate) && fp.real_estate.length === 1, 'family_profile.real_estate');
    console.log('OK: family_profile');

    console.log('--- 4. PUT credits ---');
    await client.put(`/api/pfp/clients/${clientId}`, {
        credits: [
            {
                type: 'MORTGAGE',
                balance: 2000000,
                monthlyPayment: 50000,
                rate: 11,
                name: 'Ипотека smoke',
            },
        ],
    });
    const afterCredits = await client.get(`/api/pfp/clients/${clientId}/plans`);
    assert(Number(afterCredits.data.liabilities_total) === 2000000, 'liabilities_total');
    console.log('OK: credits -> liabilities, net_worth:', afterCredits.data.net_worth);

    console.log('--- 5. legacy PUT /api/client/:id ---');
    await client.put(`/api/client/${clientId}`, {
        client: { notes: 'smoke patch via legacy route' },
    });
    const afterLegacy = await client.get(`/api/client/${clientId}`);
    assert(afterLegacy.data.notes === 'smoke patch via legacy route', 'legacy route notes');
    console.log('OK: legacy PUT');

    console.log('\n✅ smoke_agent_client_patch passed');
}

run().catch((e) => {
    if (e.response) {
        console.error('HTTP', e.response.status, JSON.stringify(e.response.data, null, 2));
    } else {
        console.error(e.message || e);
    }
    process.exit(1);
});
