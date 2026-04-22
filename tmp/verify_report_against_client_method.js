const axios = require('axios');

function toNum(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function pickGoal(goals) {
    if (!Array.isArray(goals) || goals.length === 0) return null;
    return goals.find((g) => String(g?.goal_type || '').toUpperCase() === 'PENSION') || goals[0];
}

async function main() {
    const BASE = process.env.PFP_BASE || 'https://pfpbackend-production.up.railway.app';
    const email = process.env.PFP_TEST_EMAIL || 'vissarovav2408@yandex.ru';
    const password = process.env.PFP_TEST_PASSWORD || '123456';
    const clientId = Number(process.argv[2] || process.env.PFP_CLIENT_ID || 411);

    const login = await axios.post(`${BASE}/api/auth/login`, { email, password }, { timeout: 60000 });
    const token = login.data?.token;
    if (!token) throw new Error('No token');
    const auth = { headers: { Authorization: `Bearer ${token}` }, timeout: 120000 };

    const [clientRes, reportRes] = await Promise.all([
        axios.get(`${BASE}/api/client/${clientId}`, auth),
        axios.get(`${BASE}/api/pfp/reports/${clientId}`, auth),
    ]);

    const client = clientRes.data || {};
    const report = reportRes.data || {};
    const goal = pickGoal(report.goals_detailed || []);

    const checks = [
        {
            field: 'first_name',
            client: String(client.first_name || ''),
            report: String(report.client_info?.first_name || ''),
        },
        {
            field: 'last_name',
            client: String(client.last_name || ''),
            report: String(report.client_info?.last_name || ''),
        },
        {
            field: 'avg_monthly_income',
            client: toNum(client.avg_monthly_income),
            report: toNum(report.client_info?.avg_monthly_income),
        },
        {
            field: 'total_liquid_capital',
            client: toNum(client.total_liquid_capital),
            report: toNum(report.current_situation?.net_worth),
        },
        {
            field: 'pension_target_present',
            client: toNum(client.goals?.find((g) => Number(g.goal_type_id) === 1)?.target_amount),
            report: toNum(goal?.summary?.projected_pension_monthly_present),
        },
    ];

    const mismatches = checks.filter((c) => c.client !== c.report);
    console.log(
        JSON.stringify(
            {
                base: BASE,
                clientId,
                status: mismatches.length ? 'MISMATCH' : 'OK',
                checks,
                mismatches,
                reportGoalType: goal?.goal_type || null,
            },
            null,
            2
        )
    );
}

main().catch((e) => {
    console.error('VERIFY_FAILED', e.response?.status || '', e.message);
    if (e.response?.data) {
        try {
            console.error(JSON.stringify(e.response.data, null, 2).slice(0, 1200));
        } catch (_) {}
    }
    process.exit(1);
});
