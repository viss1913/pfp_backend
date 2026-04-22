const axios = require('axios');

async function main() {
    const BASE = process.env.PFP_BASE || 'https://pfpbackend-production.up.railway.app';
    const email = process.env.PFP_TEST_EMAIL || 'vissarovav2408@yandex.ru';
    const password = process.env.PFP_TEST_PASSWORD || '123456';

    const login = await axios.post(`${BASE}/api/auth/login`, { email, password }, { timeout: 60000 });
    const token = login.data?.token;
    if (!token) throw new Error('No token');

    const res = await axios.get(`${BASE}/api/client/408`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 120000,
    });

    const data = res.data || {};
    const out = {
        keys: Object.keys(data),
        id: data.id,
        first_name: data.first_name,
        last_name: data.last_name,
        avg_monthly_income: data.avg_monthly_income,
        total_liquid_capital: data.total_liquid_capital,
        hasGoalsSummary: Boolean(data.goals_summary),
    };
    console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
    console.error('ERR', e.response?.status || '', e.message);
    if (e.response?.data) {
        try {
            console.error(JSON.stringify(e.response.data, null, 2).slice(0, 1000));
        } catch (_) {}
    }
    process.exit(1);
});
