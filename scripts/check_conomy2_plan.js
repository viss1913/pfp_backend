// Проверочный скрипт для проекта Conomy 2 (id=11)
// Сценарий:
// - логинимся агентом ms@conomy.ru / 123456
// - создаём клиента с указанными параметрами
// - считаем план и выводим ключевые цели

require('dotenv').config({ override: true });
const axios = require('axios');
const jwt = require('jsonwebtoken');

// По умолчанию бьём по продовому Railway, локалку можно включить через TEST_API_BASE_URL
const BASE_URL = process.env.TEST_API_BASE_URL || 'https://pfpbackend-production.up.railway.app';

async function loginAgent() {
    const client = axios.create({ baseURL: BASE_URL, withCredentials: true });

    const res = await client.post('/api/auth/login', {
        email: 'ms@conomy.ru',
        password: '123456'
    });

    const token = res.data?.token;
    if (!token) {
        throw new Error('Не получили token при логине агента');
    }

    // Декодим токен, чтобы увидеть, в какой проект реально попали
    try {
        const decoded = jwt.decode(token) || {};
        console.log('Decoded JWT:', {
            userId: decoded.id || decoded.user_id,
            role: decoded.role,
            projectId: decoded.projectId || decoded.project_id,
            email: decoded.email
        });
    } catch (e) {
        console.warn('Не удалось декодировать JWT:', e.message);
    }

    return axios.create({
        baseURL: BASE_URL,
        headers: {
            Authorization: `Bearer ${token}`
        }
    });
}

async function createClientAndPlan(api) {
    // Создаём/обновляем план клиента через агентский эндпоинт
    const payload = {
        client: {
            first_name: 'Тест Conomy2',
            sex: 'male',
            birth_date: '1980-01-01', // 45 лет
            total_liquid_capital: 1600000, // первоначальный капитал
            avg_monthly_income: 0
        },
        goals: [
            {
                goal_type_id: 1,
                name: 'Госпенсия',
                priority: 1
            },
            {
                goal_type_id: 2,
                name: 'Дом через 5 лет',
                priority: 2,
                target_amount: 10000000,
                term_months: 60
            },
            {
                goal_type_id: 3,
                name: 'Финансовый резерв',
                priority: 3,
                target_amount: 100000, // уже есть 100к
                monthly_contribution: 3000
            },
            {
                goal_type_id: 4,
                name: 'Страхование жизни',
                priority: 4,
                target_amount: 2000000,
                term_months: 180 // 15 лет
            }
        ]
    };

    const res = await api.post('/api/client/first-run', payload);
    return res.data;
}

async function run() {
    try {
        console.log('BASE_URL =', BASE_URL);
        const api = await loginAgent();
        console.log('✅ Логин агента прошёл успешно');

        const data = await createClientAndPlan(api);
        const goals = data.goals || [];

        console.log(`\nСоздан клиент ID: ${data.client_id || data.id || 'N/A'}`);
        console.log('Всего целей:', goals.length);

        for (const g of goals) {
            console.log(`\n=== ${g.goal_name || g.name} (type ${g.goal_type_id}) ===`);
            console.log('Status:', g.status || 'N/A');
            if (g.financials) {
                console.log('  Recommended monthly:', g.financials.recommended_replenishment || 'N/A');
                console.log('  Without PDS:', g.financials.recommended_replenishment_without_pds || 'N/A');
            }
            if (g.summary) {
                console.log('  Summary:', JSON.stringify(g.summary, null, 2));
            }
        }
    } catch (err) {
        console.error('\n❌ Ошибка проверочного скрипта');
        if (err.response) {
            console.error('Status:', err.response.status);
            console.error('Data:', JSON.stringify(err.response.data, null, 2));
        } else {
            console.error(err);
        }
    }
}

run();

