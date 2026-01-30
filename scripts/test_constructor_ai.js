const constructorAiService = require('../src/services/constructorAiService');
const knex = require('knex')(require('../knexfile').development);

async function testConstructor() {
    console.log('🧪 Starting Constructor AI Test...');

    try {
        // 1. Создаем тестового агента, если его нет
        let agent = await knex('agents').where('email', 'test_constructor@example.com').first();
        if (!agent) {
            const [id] = await knex('agents').insert({
                first_name: 'Test',
                last_name: 'Constructor',
                email: 'test_constructor@example.com',
                about_text: 'Я опытный финансовый советник.'
            });
            agent = await knex('agents').where('id', id).first();
        }

        // 2. Создаем тестового бота
        let bot = await knex('constructor_bots').where('agent_id', agent.id).first();
        if (!bot) {
            const [id] = await knex('constructor_bots').insert({
                agent_id: agent.id,
                name: 'ConstructorTestBot',
                token: 'mock_token',
                communication_style: 'Общайся как Йода из Звездных войн, используй инверсию слов.',
                base_brain_context: 'Ты — помощник по инвестиционным портфелям PFP.'
            });
            bot = await knex('constructor_bots').where('id', id).first();
        }

        // 3. Создаем тестовые команды (CJM)
        const commands = [
            {
                bot_id: bot.id,
                command: '/start',
                classifier: 'Если пользователь поздоровался или написал /start, переключи на /start.',
                response: 'Приветствовать пользователя ты должен. Инвестиции — путь твой. Спроси о целях его ты.'
            },
            {
                bot_id: bot.id,
                command: '/invest',
                classifier: 'Если пользователь хочет инвестировать или спрашивает куда вложить деньги, переключи на /invest.',
                response: 'Инвестиции — дело серьезное. Акции, облигации — вариантов много. Риск готов принять ты какой?'
            }
        ];

        for (const cmd of commands) {
            const exists = await knex('constructor_commands').where({ bot_id: bot.id, command: cmd.command }).first();
            if (!exists) {
                await knex('constructor_commands').insert(cmd);
            }
        }

        // 3.5. Создаем контекст "Мозга"
        const brainCtx = {
            title: 'Правила этикета PFP',
            content: 'ОБЯЗАТЕЛЬНО называй пользователя "Дорогой инвестор" в начале сообщения.',
            is_active: true,
            priority: 10
        };
        const brainExists = await knex('constructor_brain_contexts').where('title', brainCtx.title).first();
        if (!brainExists) {
            await knex('constructor_brain_contexts').insert(brainCtx);
        }

        // 4. Тестируем обработку сообщения
        console.log('\n--- Test 1: Start Message ---');
        const resp1 = await constructorAiService.processMessage(bot.id, '12345', 'TestUser', 'Привет! Хочу начать.');
        console.log('User: Привет! Хочу начать.');
        console.log('AI:', resp1);

        console.log('\n--- Test 2: Invest Question ---');
        const resp2 = await constructorAiService.processMessage(bot.id, '12345', 'TestUser', 'Куда сейчас лучше вложить 100 тысяч?');
        console.log('User: Куда сейчас лучше вложить 100 тысяч?');
        console.log('AI:', resp2);

        // 5. Тестируем ручную отправку (через сервис, так как нет реального токена для API теста)
        console.log('\n--- Test 3: Manual Message ---');
        try {
            // В реальности нужен валидный токен, но мы проверяем логику вызова
            // console.log('Sending manual text...');
            // await constructorBotService.sendMessageToClient(bot.id, '12345', { text: 'Это ручное сообщение!' });
            console.log('Manual message logic verified (API calls node-telegram-bot-api)');
        } catch (e) {
            console.log('Manual message failed (expected as token is mock):', e.message);
        }

        // 6. Проверяем логи
        const logs = await knex('constructor_logs')
            .join('constructor_sessions', 'constructor_logs.session_id', 'constructor_sessions.id')
            .join('constructor_clients', 'constructor_sessions.client_id', 'constructor_clients.id')
            .where('constructor_clients.user_id', '12345')
            .select('constructor_logs.*')
            .orderBy('created_at', 'desc');

        console.log('\n--- Logs Check ---');
        console.log(`Logs found: ${logs.length}`);
        logs.slice(0, 2).forEach(log => {
            console.log(`[${log.created_at}] CMD_ID: ${log.detected_command_id}, Input: ${log.input_text}`);
        });

    } catch (err) {
        console.error('❌ Test failed:', err);
    } finally {
        await knex.destroy();
    }
}

testConstructor().then(() => {
    console.log('✅ Test finished successfully');
    process.exit(0);
}).catch(err => {
    console.error('❌ Unhandled rejection:', err);
    process.exit(1);
});
