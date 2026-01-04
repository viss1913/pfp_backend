// require('dotenv').config({ override: true });
const axios = require('axios');

const API_KEY = 'pk_live_86e37c419658eecc_469ae342d5e2736cfcc6a0138727e8ebd22da7895a084b7bd7b7ecd51f487127';
const BASE_URL = 'http://localhost:3000';

if (!API_KEY) {
    console.error('Set TEST_API_KEY in .env');
    process.exit(1);
}

const client = axios.create({
    baseURL: BASE_URL,
    headers: { 'x-api-key': API_KEY }
});

async function runTest() {
    try {
        console.log('--- 1. Создание клиента с UUID ---');
        const customUuid = 'ext-uuid-' + Date.now();
        const createRes = await client.post('/api/client/first-run', {
            goals: [{ goal_type_id: 1, name: 'UUID Goal', target_amount: 50000, risk_profile: 'BALANCED' }],
            client: {
                fio: 'Тестов Ууид Игоревич',
                uuid: customUuid,
                phone: '79991112233',
                birth_date: '1990-01-01',
                sex: 'male'
            }
        });
        const clientId = createRes.data.client_id;
        console.log('✅ Клиент создан. ID:', clientId);

        console.log('\n--- 2. Проверка поиска по UUID ---');
        const listRes = await client.get(`/api/client/agent-clients?search=${customUuid}`);
        if (listRes.data.data.length > 0 && listRes.data.data[0].external_uuid === customUuid) {
            console.log('✅ Клиент найден по UUID');
        } else {
            console.error('❌ Клиент не найден по UUID');
        }

        console.log('\n--- 3. Обновление клиента (Edit) ---');
        await client.put(`/api/client/${clientId}`, {
            client: {
                first_name: 'ОбновленноеИмя',
                phone: '70000000000'
            },
            assets: [
                { type: 'CASH', name: 'Zanchka', current_value: 100000 }
            ]
        });

        const getRes = await client.get(`/api/client/${clientId}`);
        console.log('✅ Данные после обновления (Net Worth):', getRes.data.net_worth);
        console.log('Даты:', { created: getRes.data.created_at, updated: getRes.data.updated_at });

        if (getRes.data.first_name === 'ОбновленноеИмя' && getRes.data.net_worth == 100000) {
            console.log('✅ Обновление прошло успешно!');
        } else {
            console.error('❌ Ошибка обновления данных');
        }

    } catch (e) {
        if (e.response) {
            console.error('Ошибка теста (Server):', JSON.stringify(e.response.data, null, 2));
        } else {
            console.error('Ошибка теста:', e);
        }
    }
}

runTest();
