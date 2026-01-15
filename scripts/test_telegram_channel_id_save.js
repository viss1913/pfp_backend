/**
 * Тестирование сохранения telegram_channel_id через API
 */

const axios = require('axios');

const API_BASE = 'https://pfpbackend-production.up.railway.app/api';
const ADMIN_EMAIL = 'admin@pfp.local';
const ADMIN_PASSWORD = 'admin123';

async function testTelegramChannelIdSave() {
    try {
        console.log('=== ТЕСТ СОХРАНЕНИЯ TELEGRAM_CHANNEL_ID ===\n');

        // 1. Авторизация
        console.log('1. Авторизация на', API_BASE);
        console.log(`   Email: ${ADMIN_EMAIL}`);

        const loginResponse = await axios.post(`${API_BASE}/auth/login`, {
            email: ADMIN_EMAIL,
            password: ADMIN_PASSWORD
        });

        const token = loginResponse.data.token;
        console.log('   ✅ Токен получен:', token.substring(0, 20) + '...');
        console.log('');

        // 2. Получаем список агентов
        console.log('2. Получение списка агентов...');
        const agentsResponse = await axios.get(`${API_BASE}/pfp/agents`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const agents = agentsResponse.data;
        console.log(`   ✅ Получено агентов: ${agents.length}`);

        if (agents.length === 0) {
            console.log('   ❌ Нет агентов для тестирования');
            return;
        }

        // Ищем агента с ID 10001 (из скриншота БД)
        const targetAgent = agents.find(a => a.id === 10001) || agents[agents.length - 1];
        console.log(`\n   Тестируем агента:`);
        console.log(`   - ID: ${targetAgent.id}`);
        console.log(`   - Имя: ${targetAgent.first_name} ${targetAgent.last_name}`);
        console.log(`   - telegram_bot: "${targetAgent.telegram_bot}"`);
        console.log(`   - telegram_channel: "${targetAgent.telegram_channel}"`);
        console.log(`   - telegram_channel_id (до): "${targetAgent.telegram_channel_id}"`);
        console.log('');

        // 3. Обновляем telegram_channel_id
        console.log('3. Обновление telegram_channel_id...');
        const testChannelId = '-100123456789';

        const updatePayload = {
            telegram_channel_id: testChannelId
        };

        console.log('   Отправляемые данные:', JSON.stringify(updatePayload, null, 2));

        const updateResponse = await axios.patch(
            `${API_BASE}/pfp/agents/${targetAgent.id}`,
            updatePayload,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('\n   Ответ от API:');
        console.log(`   - telegram_bot: "${updateResponse.data.telegram_bot}"`);
        console.log(`   - telegram_channel: "${updateResponse.data.telegram_channel}"`);
        console.log(`   - telegram_channel_id: "${updateResponse.data.telegram_channel_id}"`);
        console.log('');

        // 4. Повторно получаем данные агента для проверки
        console.log('4. Проверка сохранения (GET запрос)...');
        const verifyResponse = await axios.get(
            `${API_BASE}/pfp/agents/${targetAgent.id}`,
            {
                headers: { Authorization: `Bearer ${token}` }
            }
        );

        console.log(`   telegram_channel_id после обновления: "${verifyResponse.data.telegram_channel_id}"`);
        console.log('');

        // 5. Результат
        console.log('=== РЕЗУЛЬТАТ ===');
        if (verifyResponse.data.telegram_channel_id === testChannelId) {
            console.log('✅ УСПЕХ: telegram_channel_id сохранился корректно!');
            console.log('   Проблема НЕ на бэкенде.');
            console.log('   Нужно проверить фронтенд - возможно, он не отправляет это поле.');
        } else {
            console.log('❌ ОШИБКА: telegram_channel_id НЕ сохранился!');
            console.log(`   Ожидалось: "${testChannelId}"`);
            console.log(`   Получено: "${verifyResponse.data.telegram_channel_id}"`);
            console.log('   Проблема на БЭКЕНДЕ.');
        }

    } catch (error) {
        console.error('\n❌ ОШИБКА:', error.message);
        if (error.response) {
            console.error('   HTTP Status:', error.response.status);
            console.error('   Response:', JSON.stringify(error.response.data, null, 2));
        }
        if (error.request && !error.response) {
            console.error('   Нет ответа от сервера. Проверьте URL:', API_BASE);
        }
    }
}

testTelegramChannelIdSave();
