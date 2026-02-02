const aiService = require('./aiService');
const knex = require('../config/database');
const homeOwnersCalculator = require('./calculators/HomeOwnersCalculator');

class ConstructorAiService {
    /**
     * Шаг 1: Классификация - определение следующей стадии диалога
     */
    async classifyStage(session, userMessage) {
        const { current_command_id, client_id } = session;

        // 1. Получаем все доступные команды для этого бота (или глобальные шаблоны)
        // Приоритезируем команды конкретного бота над шаблонами
        const client = await knex('constructor_clients').where('id', client_id).first();
        const bot = await knex('constructor_bots').where('id', client.bot_id).first();

        const commands = await knex('constructor_commands')
            .where('bot_id', bot.id)
            .orWhere('is_template', true)
            .orderByRaw('bot_id DESC, is_template ASC'); // Бот > Шаблон

        // 2. Формируем контекст классификатора
        let currentCommand = null;
        if (current_command_id) {
            currentCommand = commands.find(c => Number(c.id) === Number(current_command_id));
        }

        // 1.5 Принудительно выбираем /start для первого сообщения если это /start
        if (!current_command_id && userMessage.trim().toLowerCase().includes('/start')) {
            const startCmd = commands.find(c => c.command === '/start');
            if (startCmd) return startCmd;
        }

        // 1.6 Получаем историю для классификатора
        const history = await knex('constructor_logs')
            .where('session_id', session.id)
            .orderBy('created_at', 'desc')
            .limit(5); // Для классификации достаточно 5 последних сообщений

        const historyMessages = history.reverse().map(log => ([
            { role: 'user', content: log.input_text },
            { role: 'assistant', content: log.response_generated || '' }
        ])).flat();

        const classifierInstructions = currentCommand ? currentCommand.classifier : "Определи начальную стадию диалога.";

        const prompt = [
            {
                role: 'system',
                content: `Ты — классификатор стадий диалога. 
Твоя задача: на основе сообщения пользователя, истории переписки и инструкций определить ключ (command) следующей стадии.
Доступные команды: ${commands.map(c => c.command).join(', ')}.
Инструкции по переключению (текущая стадия: ${currentCommand ? currentCommand.command : 'начало'}): ${classifierInstructions}

ОТВЕТЬ ТОЛЬКО КЛЮЧОМ КОМАНДЫ (например: /meeting). 
Если сообщение пользователя не требует переключения стадии или ты не уверен, верни текущую команду (или /start если это начало). 
Не пиши ничего кроме ключа команды.`
            },
            ...historyMessages,
            {
                role: 'user',
                content: userMessage
            }
        ];

        try {
            console.log(`[AI Step 1] Client: ${client_id}, Bot: ${bot.id}`);
            console.log(`[AI Step 1] User Message: "${userMessage}"`);
            console.log(`[AI Step 1] System Prompt Instructions: ${classifierInstructions}`);

            const result = await aiService.getCompletion(prompt);

            // Очистка ответа (удаляем точки, кавычки и извлекаем первое слово-команду)
            const detectedCommand = result.trim().replace(/[."'`#*@]/g, '').split(' ')[0];

            console.log(`[AI Step 1] Detected Command (Raw): "${result}"`);
            console.log(`[AI Step 1] Detected Command (Clean): "${detectedCommand}"`);

            let nextCommand = commands.find(c => c.command === detectedCommand);

            // Если команда не распознана, остаемся на текущей или выбираем /start
            if (!nextCommand) {
                nextCommand = currentCommand || commands.find(c => c.command === '/start');
            }

            if (nextCommand && (!currentCommand || Number(nextCommand.id) !== Number(current_command_id))) {
                console.log(`[AI Step 1] Stage Switch: ${currentCommand ? currentCommand.command : 'None'} -> ${nextCommand.command}`);
            }

            return nextCommand;
        } catch (error) {
            console.error('[AI Step 1] Classification error:', error);
            return currentCommand;
        }
    }

    /**
     * Извлечение параметров для расчета страхования имущества из истории диалога
     */
    async extractHomeOwnersParams(session) {
        const history = await knex('constructor_logs')
            .where('session_id', session.id)
            .orderBy('created_at', 'desc')
            .limit(10);

        const historyText = history.reverse().map(log =>
            `User: ${log.input_text}\nAssistant: ${log.response_generated}`
        ).join('\n');

        const prompt = [
            {
                role: 'system',
                content: `Ты — аналитик данных. Твоя задача: извлечь параметры для расчета страхования квартиры из диалога.
Ищи следующие значения:
1. finish (отделка) - сумма страхования отделки.
2. property (имущество) - сумма страхования движимого имущества.
3. civil (ГО) - сумма страхования гражданской ответственности.

ОТВЕТЬ ТОЛЬКО ЧИСТЫМ JSON без пояснений. Если значение не найдено, используй 0.
Пример: {"finish": 500000, "property": 300000, "civil": 1000000}
`
            },
            {
                role: 'user',
                content: `Диалог:\n${historyText}`
            }
        ];

        try {
            const result = await aiService.getCompletion(prompt);
            const cleanResult = result.replace(/```json|```/g, '').trim();
            return JSON.parse(cleanResult);
        } catch (error) {
            console.error('[AI] Error extracting homeOwners params:', error);
            return { finish: 0, property: 0, civil: 0 };
        }
    }

    /**
     * Шаг 2: Генерация ответа (Послойный промпт)
     */
    async generateResponse(session, command, userMessage, calculationResult = null) {
        const client = await knex('constructor_clients').where('id', session.client_id).first();
        const bot = await knex('constructor_bots').where('id', client.bot_id).first();

        // Получаем активные контексты Мозга (Brain)
        const brainContexts = await knex('constructor_brain_contexts')
            .where('is_active', true)
            .orderBy('priority', 'desc');

        const brainSection = brainContexts.map(ctx => `--- ${ctx.title} ---\n${ctx.content}`).join('\n\n');

        // Получаем историю (последние 10 сообщений из логов)
        const history = await knex('constructor_logs')
            .where('session_id', session.id)
            .orderBy('created_at', 'desc')
            .limit(10);

        const historyMessages = history.reverse().map(log => ([
            { role: 'user', content: log.input_text },
            { role: 'assistant', content: log.response_generated }
        ])).flat();

        const layeredPrompt = [
            {
                role: 'system',
                content: `
Ты — ИИ-ассистент по имени "${bot.name || 'Помощник'}".

СЛОЙ 1 (БАЗОВЫЙ КОНТЕКСТ И ЗНАНИЯ):
${bot.base_brain_context || 'Ты — опытный финансовый консультант и помощник агента.'}
${brainSection ? '\nДополнительные инструкции из базы знаний:\n' + brainSection : ''}

СЛОЙ 2 (СТИЛИСТИКА ОБЩЕНИЯ):
${bot.communication_style || 'Общайся вежливо и профессионально.'}

СЛОЙ 3 (ТЕКУЩАЯ ЗАДАЧА/СЦЕНАРИЙ):
${command.response}
${calculationResult ? '\nТЫ ПОЛУЧИЛ JSON С РАСЧЕТОМ:\n' + JSON.stringify(calculationResult, null, 2) : ''}

СЛОЙ 4 (ДАННЫЕ О КЛИЕНТЕ):
${client.user_context || 'Информации о клиенте пока нет.'}

ВАЖНО: Придерживайся своей роли и стиля. Отвечай кратко и по делу.
Используй Markdown для оформления (жирный текст для заголовков и сумм, списки для перечислений).
`
            },
            ...historyMessages,
            {
                role: 'user',
                content: userMessage
            }
        ];

        try {
            console.log(`[AI Step 2] Generating response for command: ${command.command}`);
            console.log(`[AI Step 2] Layered Prompt (System): ${layeredPrompt[0].content}`);

            const responseText = await aiService.getCompletion(layeredPrompt);

            console.log(`[AI Step 2] AI Response: "${responseText.substring(0, 100)}${responseText.length > 100 ? '...' : ''}"`);

            return responseText;
        } catch (error) {
            console.error('[AI Step 2] Response generation error:', error);
            return "Извините, произошла ошибка. Попробуйте позже.";
        }
    }

    /**
     * Полный цикл обработки сообщения
     */
    async processMessage(botId, telegramUserId, nickname, userMessage) {
        if (userMessage && userMessage.trim().toLowerCase() === '/reset') {
            console.log(`[Lifecycle] Reset command received from ${nickname} (${telegramUserId})`);

            // Получаем клиента перед удалением для логов
            const clientToDelete = await knex('constructor_clients')
                .where({ bot_id: botId, user_id: telegramUserId })
                .first();

            if (clientToDelete) {
                // Удаляем клиента. Каскадное удаление (ON DELETE CASCADE) само удалит сессии и логи.
                await knex('constructor_clients').where('id', clientToDelete.id).del();
                console.log(`[Lifecycle] Data for client ${clientToDelete.id} successfully wiped.`);
            }

            return "Ваши данные и история диалога полностью удалены.";
        }

        let client = await knex('constructor_clients')
            .where({ bot_id: botId, user_id: telegramUserId })
            .first();

        if (!client) {
            [client] = await knex('constructor_clients').insert({
                bot_id: botId,
                user_id: telegramUserId,
                nickname: nickname
            });
            client = await knex('constructor_clients').where('id', client).first();
        }

        let session = await knex('constructor_sessions').where('client_id', client.id).first();
        if (!session) {
            [session] = await knex('constructor_sessions').insert({
                client_id: client.id
            });
            session = await knex('constructor_sessions').where('id', session).first();
        }

        console.log(`\n--- Processing Message from ${nickname} (${telegramUserId}) ---`);

        // 1. Классификация
        const nextCommand = await this.classifyStage(session, userMessage);

        let calculationResult = null;
        // Если перешли на стадию расчета или получили команду принудительно
        if (nextCommand && nextCommand.command === '/homeOwnersCalc') {
            const limits = await this.extractHomeOwnersParams(session);
            console.log(`[Flow] Performing Home Owners Calculation with limits:`, limits);

            try {
                calculationResult = await homeOwnersCalculator.calculate({
                    product_id: 1, // ID продукта "Домашний уют"
                    object_params: {}, // Пока без доп. параметров в диалоге
                    limits: limits
                });
            } catch (calcErr) {
                console.error('Calculation failed:', calcErr);
            }
        }

        // 2. Генерация ответа
        const responseText = await this.generateResponse(session, nextCommand, userMessage, calculationResult);

        // 3. Обновление сессии и логирование
        await knex('constructor_sessions')
            .where('id', session.id)
            .update({
                current_command_id: nextCommand ? nextCommand.id : null,
                updated_at: knex.fn.now()
            });

        await knex('constructor_logs').insert({
            session_id: session.id,
            input_text: userMessage,
            detected_command_id: nextCommand ? nextCommand.id : null,
            response_generated: responseText
        });

        console.log(`--- Message Processed (Next Command: ${nextCommand ? nextCommand.command : 'none'}) ---\n`);

        return responseText;
    }
}

module.exports = new ConstructorAiService();
