/**
 * Прогон матрицы first-run по плану (20 сценариев).
 * Запуск: node scripts/pfp-first-run-matrix.mjs
 * Env: PFP_BASE_URL, PFP_EMAIL, PFP_PASSWORD
 */
const BASE =
    process.env.PFP_BASE_URL || 'https://pfpbackend-production.up.railway.app';
const EMAIL = process.env.PFP_EMAIL || 'skondratyuk@corp.finam.ru';
const PASSWORD = process.env.PFP_PASSWORD || '123456';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function finReserve(risk = 'BALANCED') {
    return {
        goal_type_id: 7,
        name: 'Финансовый резерв',
        term_months: 12,
        initial_capital: 120000,
        monthly_replenishment: 5000,
        risk_profile: risk
    };
}

function lifeGoal(risk = 'BALANCED') {
    return {
        goal_type_id: 5,
        name: 'Защита жизни НСЖ',
        target_amount: 1200000,
        term_months: 120,
        payment_variant: 12,
        program: 'base',
        risk_profile: risk
    };
}

function pension(risk = 'BALANCED') {
    return {
        goal_type_id: 1,
        name: 'Пенсия',
        desired_monthly_income: 85000,
        risk_profile: risk
    };
}

function passive(risk = 'BALANCED') {
    return {
        goal_type_id: 2,
        name: 'Пассивный доход',
        desired_monthly_income: 45000,
        term_months: 120,
        risk_profile: risk
    };
}

function invest(risk = 'BALANCED') {
    return {
        goal_type_id: 3,
        name: 'Сохранить и приумножить',
        term_months: 120,
        monthly_replenishment: 12000,
        initial_capital: 0,
        risk_profile: risk
    };
}

function otherApartment(risk = 'BALANCED') {
    return {
        goal_type_id: 4,
        name: 'Квартира',
        target_amount: 4500000,
        term_months: 120,
        initial_capital: 250000,
        risk_profile: risk
    };
}

function otherEducation(risk = 'BALANCED') {
    return {
        goal_type_id: 4,
        name: 'Образование ребёнка',
        target_amount: 2500000,
        term_months: 96,
        initial_capital: 150000,
        risk_profile: risk
    };
}

function otherCar(risk = 'BALANCED') {
    return {
        goal_type_id: 4,
        name: 'Авто',
        target_amount: 2800000,
        term_months: 60,
        initial_capital: 200000,
        risk_profile: risk
    };
}

function otherRepair(risk = 'BALANCED') {
    return {
        goal_type_id: 4,
        name: 'Ремонт',
        target_amount: 1800000,
        term_months: 36,
        initial_capital: 100000,
        risk_profile: risk
    };
}

function rent(risk = 'BALANCED') {
    return {
        goal_type_id: 8,
        name: 'Аренда / доход с капитала',
        term_months: 12,
        initial_capital: 400000,
        risk_profile: risk
    };
}

function baseClient(overrides = {}) {
    return {
        birth_date: '1988-06-15',
        sex: 'male',
        avg_monthly_income: 180000,
        total_liquid_capital: 800000,
        fio: overrides.fio || 'Матрица first-run',
        ...overrides
    };
}

const tests = [
    {
        id: 'T01',
        client: () => baseClient({ fio: 'Тест T01 пенсия' }),
        goals: (r) => [finReserve(r), lifeGoal(r), pension(r)]
    },
    {
        id: 'T02',
        client: () =>
            baseClient({
                fio: 'Тест T02 пенсия+дети',
                enable_children_tax_deduction: true,
                tax_children: [
                    {
                        birth_date: '2014-09-01',
                        is_full_time_student: true
                    }
                ]
            }),
        goals: (r) => [finReserve(r), lifeGoal(r), pension(r)]
    },
    {
        id: 'T03',
        client: () => baseClient({ fio: 'Тест T03 пассив' }),
        goals: (r) => [finReserve(r), lifeGoal(r), passive(r)]
    },
    {
        id: 'T04',
        client: () => baseClient({ fio: 'Тест T04 инвест' }),
        goals: (r) => [finReserve(r), lifeGoal(r), invest(r)]
    },
    {
        id: 'T05',
        client: () => baseClient({ fio: 'Тест T05 квартира' }),
        goals: (r) => [finReserve(r), lifeGoal(r), otherApartment(r)]
    },
    {
        id: 'T06',
        client: () => baseClient({ fio: 'Тест T06 образование' }),
        goals: (r) => [finReserve(r), lifeGoal(r), otherEducation(r)]
    },
    {
        id: 'T07',
        client: () => baseClient({ fio: 'Тест T07 аренда' }),
        goals: (r) => [finReserve(r), lifeGoal(r), rent(r)]
    },
    {
        id: 'T08',
        client: () => baseClient({ fio: 'Тест T08 авто' }),
        goals: (r) => [finReserve(r), lifeGoal(r), otherCar(r)]
    },
    {
        id: 'T09',
        client: () => baseClient({ fio: 'Тест T09 пенсия+квартира' }),
        goals: (r) => [finReserve(r), lifeGoal(r), pension(r), otherApartment(r)]
    },
    {
        id: 'T10',
        client: () => baseClient({ fio: 'Тест T10 пассив+инвест' }),
        goals: (r) => [finReserve(r), lifeGoal(r), passive(r), invest(r)]
    },
    {
        id: 'T11',
        client: () => baseClient({ fio: 'Тест T11 образование+пенсия' }),
        goals: (r) => [
            finReserve(r),
            lifeGoal(r),
            otherEducation(r),
            pension(r)
        ]
    },
    {
        id: 'T12',
        client: () =>
            baseClient({
                fio: 'Тест T12 образование+пенсия+дети',
                enable_children_tax_deduction: true,
                tax_children: [{ birth_date: '2016-05-20' }]
            }),
        goals: (r) => [
            finReserve(r),
            lifeGoal(r),
            otherEducation(r),
            pension(r)
        ]
    },
    {
        id: 'T13',
        client: () => baseClient({ fio: 'Тест T13 квартира+аренда' }),
        goals: (r) => [finReserve(r), lifeGoal(r), otherApartment(r), rent(r)]
    },
    {
        id: 'T14',
        client: () => baseClient({ fio: 'Тест T14 пенсия+пассив' }),
        goals: (r) => [finReserve(r), lifeGoal(r), pension(r), passive(r)]
    },
    {
        id: 'T15',
        client: () => baseClient({ fio: 'Тест T15 микс BALANCED' }),
        goals: (r) => [
            finReserve(r),
            lifeGoal(r),
            pension(r),
            passive(r),
            otherApartment(r),
            invest(r),
            rent(r)
        ]
    },
    {
        id: 'T16',
        client: () => baseClient({ fio: 'Тест T16 микс CONSERVATIVE' }),
        risk: 'CONSERVATIVE',
        goals: (r) => [
            finReserve(r),
            lifeGoal(r),
            pension(r),
            passive(r),
            otherApartment(r),
            invest(r),
            rent(r)
        ]
    },
    {
        id: 'T17',
        client: () => baseClient({ fio: 'Тест T17 микс AGGRESSIVE' }),
        risk: 'AGGRESSIVE',
        goals: (r) => [
            finReserve(r),
            lifeGoal(r),
            pension(r),
            passive(r),
            otherApartment(r),
            invest(r),
            rent(r)
        ]
    },
    {
        id: 'T18',
        client: () => baseClient({ fio: 'Тест T18 два OTHER' }),
        goals: (r) => [
            finReserve(r),
            lifeGoal(r),
            pension(r),
            passive(r),
            otherRepair(r),
            invest(r),
            rent(r)
        ]
    },
    {
        id: 'T19',
        client: () =>
            baseClient({
                fio: 'Тест T19 мало капитала',
                total_liquid_capital: 50000
            }),
        goals: (r) => [finReserve(r), lifeGoal(r), pension(r), otherApartment(r)]
    },
    {
        id: 'T20',
        client: () =>
            baseClient({
                fio: 'Тест T20 с активами',
                assets: [
                    {
                        type: 'deposit',
                        amount: 180000,
                        unlock_month: 24,
                        name: 'Вклад'
                    },
                    {
                        type: 'securities',
                        current_value: 120000,
                        sell_month: 48,
                        name: 'Брокерский'
                    }
                ]
            }),
        goals: (r) => [
            finReserve(r),
            lifeGoal(r),
            pension(r),
            passive(r),
            otherApartment(r),
            invest(r),
            rent(r)
        ]
    }
];

function pickSummary(body) {
    if (!body || typeof body !== 'object') return null;
    const g = body.goals || body.calculation?.goals;
    const goalBits = Array.isArray(g)
        ? g.map((x) => ({
              name: x.name || x.goal_name,
              type: x.goal_type_id,
              status: x.summary?.status,
              monthly_replenishment: x.summary?.monthly_replenishment,
              projected_capital_at_end: x.summary?.projected_capital_at_end
          }))
        : [];
    return {
        client_id: body.client_id || body.client?.id,
        goals_count: Array.isArray(g) ? g.length : 0,
        goals: goalBits.slice(0, 8)
    };
}

async function login() {
    const res = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: EMAIL, password: PASSWORD })
    });
    const text = await res.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        data = { raw: text };
    }
    if (!res.ok) {
        throw new Error(`Login ${res.status}: ${text.slice(0, 500)}`);
    }
    const token = data.token || data.accessToken;
    if (!token) throw new Error('No token in login response');
    return token;
}

async function firstRun(token, body) {
    const res = await fetch(`${BASE}/api/client/first-run`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body)
    });
    const text = await res.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        data = { parseError: true, raw: text };
    }
    return { status: res.status, data, text };
}

async function main() {
    console.log('BASE', BASE);
    const token = await login();
    console.log('Login OK\n');

    const report = [];
    for (const t of tests) {
        const risk = t.risk || 'BALANCED';
        const payload = {
            client: t.client(),
            goals: t.goals(risk)
        };
        const { status, data } = await firstRun(token, payload);
        const ok = status >= 200 && status < 300 && !data.error;
        const row = {
            id: t.id,
            http: status,
            ok,
            error: data.error || data.message || null,
            summary: ok ? pickSummary(data) : null,
            detail: !ok && data.details ? data.details : undefined
        };
        report.push(row);
        const mark = ok ? 'OK' : 'FAIL';
        console.log(`${t.id} ${mark} HTTP ${status}`);
        if (!ok) {
            console.log(
                '  ',
                JSON.stringify(
                    data.error || data.message || data,
                    null,
                    0
                ).slice(0, 400)
            );
        } else if (row.summary?.client_id) {
            console.log('   client_id', row.summary.client_id, 'goals', row.summary.goals_count);
        }
        await sleep(300);
    }

    const passed = report.filter((r) => r.ok).length;
    console.log(`\n--- Итого: ${passed}/${report.length} успешно ---`);
    return report;
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
