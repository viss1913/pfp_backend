const aiService = require('./aiService');
const knex = require('knex')(require('../../knexfile').development); // Adjust for production if needed

class ConstructorAiService {
    /**
     * Шаг 1: Классификация - определение следующей стадии диалога
     */
    async classifyStage(session, userMessage) {
        const { current_command_id, client_id } = session;

        // 1. Получаем все доступные команды для этого бота (или глобальные шаблоны)
        // Сначала ищем команды бота, если их нет - берем глобальные
        const client = await knex('constructor_clients').where('id', client_id).first();
        const bot = await knex('constructor_bots').where('id', client.bot_id).first();

        const commands = await knex('constructor_commands')
            .where('bot_id', bot.id)
            .orWhere('is_template', true);

        // 2. Формируем контекст классификатора
        // Берем classifier из текущей команды или базовый, если стадии нет
        let currentCommand = null;
        if (current_command_id) {
            currentCommand = commands.find(c => c.id === current_command_id);
        }

        const classifierInstructions = currentCommand ? currentCommand.classifier : "Определи стадию диалога.";

        const prompt = [
            {
                role: 'system',
                content: `Ты — классификатор стадий диалога. 
Твоя задача: на основе сообщения пользователя и инструкций определить ключ (command) следующей стадии.
Доступные команды: ${commands.map(c => c.command).join(', ')}.
Инструкции по переключению: ${classifierInstructions}
ОТВЕТЬ ТОЛЬКО КЛЮЧОМ КОМАНДЫ (например: /meeting). Если не уверен, верни текущую команду.`
            },
            {
                role: 'user',
                content: userMessage
            }
        ];

        try {
            const result = await aiService.getCompletion(prompt);
            const detectedCommand = result.trim();

            const nextCommand = commands.find(c => c.command === detectedCommand) || currentCommand;
            return nextCommand;
        } catch (error) {
            console.error('Classification error:', error);
            return currentCommand;
        }
    }

    /**
     * Шаг 2: Генерация ответа (Послойный промпт)
     */
    async generateResponse(session, command, userMessage) {
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
Слой 1 (Системный/Мозг): ${bot.base_brain_context || 'Ты — помощник агента.'}
${brainSection ? '\nДополнительные инструкции Мозга:\n' + brainSection : ''}

Слой 2 (Агентский): ${bot.communication_style || 'Общайся вежливо.'}
Слой 3 (Сценарный): ${command.response}
Слой 4 (Персональный): ${client.user_context || 'Информации о клиенте нет.'}
`
            },
            ...historyMessages,
            {
                role: 'user',
                content: userMessage
            }
        ];

        try {
            const responseText = await aiService.getCompletion(layeredPrompt);
            return responseText;
        } catch (error) {
            console.error('Response generation error:', error);
            return "Извините, произошла ошибка. Попробуйте позже.";
        }
    }

    /**
     * Полный цикл обработки сообщения
     */
    async processMessage(botId, telegramUserId, nickname, userMessage) {
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

        // 1. Классификация
        const nextCommand = await this.classifyStage(session, userMessage);

        // 2. Генерация ответа
        const responseText = await this.generateResponse(session, nextCommand, userMessage);

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

        return responseText;
    }
}

module.exports = new ConstructorAiService();
