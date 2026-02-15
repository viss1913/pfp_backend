const knex = require('../config/database');
const constructorBotService = require('../services/constructorBotService');

class ConstructorController {
    // --- Agent Methods ---

    /**
     * POST /pfp/constructor/bot
     * Регистрация или обновление бота агента
     */
    async registerBot(req, res) {
        const agentId = req.user.agentId || req.user.id;
        const projectId = req.projectId || req.user?.projectId;
        const { name, link, token, communication_style, base_brain_context, bot_type, webhook_secret } = req.body;

        try {
            const type = bot_type || 'telegram';
            let bot = await knex('constructor_bots').where({ agent_id: agentId, project_id: projectId, bot_type: type }).first();

            if (bot) {
                await knex('constructor_bots')
                    .where('id', bot.id)
                    .update({
                        name,
                        link,
                        token,
                        webhook_secret,
                        communication_style,
                        base_brain_context,
                        updated_at: knex.fn.now()
                    });
            } else {
                const [id] = await knex('constructor_bots').insert({
                    agent_id: agentId,
                    project_id: projectId,
                    name,
                    link,
                    token,
                    webhook_secret,
                    bot_type: type,
                    communication_style,
                    base_brain_context
                });
                bot = { id };
            }

            // Перезапускаем бота с новым токеном/настройками
            await constructorBotService.restartBot(bot.id);

            res.json({ success: true, message: 'Bot registered and started' });
        } catch (error) {
            console.error('registerBot error details:', {
                agentId,
                error: error.message,
                stack: error.stack
            });
            res.status(500).json({
                error: 'Failed to register bot',
                message: error.message,
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    }

    /**
     * GET /pfp/constructor/bot
     * Получение всех ботов агента (Telegram, MAX и др.)
     */
    async getMyBot(req, res) {
        const agentId = req.user.agentId || req.user.id;
        const projectId = req.projectId || req.user?.projectId;
        const { bot_type } = req.query;

        try {
            let query = knex('constructor_bots').where({ agent_id: agentId, project_id: projectId });

            if (bot_type) {
                query = query.where('bot_type', bot_type);
                const bot = await query.first();
                return res.json(bot || {});
            }

            const bots = await query.orderBy('created_at', 'desc');
            res.json(bots);
        } catch (error) {
            res.status(500).json({ error: 'Failed to get bots' });
        }
    }

    /**
     * GET /pfp/constructor/clients
     */
    async getMyClients(req, res) {
        const agentId = req.user.agentId || req.user.id;
        const { bot_id } = req.query;

        try {
            // Либо берем конкретного бота, либо всех ботов агента
            let botIdsQuery = knex('constructor_bots').where('agent_id', agentId);
            if (bot_id) {
                botIdsQuery = botIdsQuery.where('id', bot_id);
            }
            const bots = await botIdsQuery.select('id');
            const botIds = bots.map(b => b.id);

            if (botIds.length === 0) return res.json([]);

            // Получаем список клиентов для всех (или одного) ботов агента
            const clients = await knex('constructor_clients as c')
                .whereIn('c.bot_id', botIds)
                .leftJoin('constructor_sessions as s', 'c.id', 's.client_id')
                .leftJoin('constructor_commands as cmd', 's.current_command_id', 'cmd.id')
                .leftJoin('constructor_bots as b', 'c.bot_id', 'b.id')
                .select(
                    'c.*',
                    'cmd.command as current_stage',
                    'b.bot_type',
                    'b.name as bot_name'
                )
                .orderBy('c.updated_at', 'desc');

            // Для каждого клиента получаем последнее сообщение из логов
            const clientsWithLastMessage = await Promise.all(clients.map(async (client) => {
                const lastLog = await knex('constructor_logs')
                    .where('session_id', function () {
                        this.select('id').from('constructor_sessions').where('client_id', client.id).limit(1);
                    })
                    .orderBy('created_at', 'desc')
                    .first();

                return {
                    ...client,
                    last_message: lastLog ? (lastLog.response_generated || lastLog.input_text) : null,
                    last_message_at: lastLog ? lastLog.created_at : client.updated_at
                };
            }));

            // Сортируем по времени последнего сообщения
            clientsWithLastMessage.sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at));

            res.json(clientsWithLastMessage);
        } catch (error) {
            console.error('getMyClients error:', error);
            res.status(500).json({ error: 'Failed to get clients' });
        }
    }

    /**
     * GET /pfp/constructor/messages/:clientId
     */
    async getMessages(req, res) {
        const agentId = req.user.agentId || req.user.id;
        const { clientId } = req.params;

        try {
            const bot = await knex('constructor_bots').where('agent_id', agentId).first();
            const client = await knex('constructor_clients').where('id', clientId).first();

            if (!bot || !client || client.bot_id !== bot.id) {
                return res.status(403).json({ error: 'Access denied' });
            }

            const sessions = await knex('constructor_sessions').where('client_id', clientId).pluck('id');
            const messages = await knex('constructor_logs')
                .whereIn('session_id', sessions)
                .select('id', 'input_text as user_message', 'response_generated as assistant_message', 'created_at')
                .orderBy('created_at', 'asc');

            res.json(messages);
        } catch (error) {
            res.status(500).json({ error: 'Failed to get messages' });
        }
    }

    /**
     * POST /pfp/constructor/send-message
     * Отправка сообщения конкретному клиенту (текст + медиа)
     */
    async sendMessage(req, res) {
        const agentId = req.user.agentId || req.user.id;
        const { clientId, text, photo, video, voice, audio, document } = req.body;

        try {
            const bot = await knex('constructor_bots').where('agent_id', agentId).first();
            const client = await knex('constructor_clients').where('id', clientId).first();

            if (!bot || !client || client.bot_id !== bot.id) {
                return res.status(403).json({ error: 'Access denied' });
            }

            const result = await constructorBotService.sendMessageToClient(bot.id, client.user_id, {
                text, photo, video, voice, audio, document
            });

            // Логируем ручное сообщение
            let session = await knex('constructor_sessions').where('client_id', clientId).first();
            if (session) {
                await knex('constructor_logs').insert({
                    session_id: session.id,
                    input_text: '[Manual Message]',
                    response_generated: text || '[Media]'
                });
            }

            res.json({ success: true, messageId: result.message_id });
        } catch (error) {
            console.error('sendMessage error:', error.message);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * POST /pfp/constructor/broadcast
     * Массовая рассылка всем клиентам агента
     */
    async broadcast(req, res) {
        const agentId = req.user.agentId || req.user.id;
        const { text, photo, video, voice, audio, document } = req.body;

        try {
            const bot = await knex('constructor_bots').where('agent_id', agentId).first();
            if (!bot) return res.status(404).json({ error: 'Bot not found' });

            const results = await constructorBotService.broadcastMessage(bot.id, {
                text, photo, video, voice, audio, document
            });

            res.json({ success: true, results });
        } catch (error) {
            console.error('broadcast error:', error.message);
            res.status(500).json({ error: error.message });
        }
    }

    // --- Admin Methods ---

    /**
     * GET /admin/constructor/bots
     */
    async getAllBots(req, res) {
        try {
            const projectId = req.projectId || req.user?.projectId;
            const query = knex('constructor_bots')
                .leftJoin('agents', 'constructor_bots.agent_id', 'agents.id')
                .select('constructor_bots.*', 'agents.email as agent_email');

            if (projectId) {
                query.where('constructor_bots.project_id', projectId);
            }

            const bots = await query;
            res.json(bots);
        } catch (error) {
            res.status(500).json({ error: 'Failed to get bots' });
        }
    }

    /**
     * GET /commands
     * Получение списка команд (шаблонов или команд конкретного бота)
     */
    async getCommands(req, res) {
        const { bot_id, is_template } = req.query;
        try {
            let query = knex('constructor_commands');

            if (bot_id) {
                query = query.where('bot_id', bot_id);
            } else if (is_template !== undefined) {
                query = query.where('is_template', is_template === 'true' || is_template === true);
            } else {
                // По умолчанию возвращаем шаблоны
                query = query.where('is_template', true);
            }

            const commands = await query.orderBy('created_at', 'desc');
            res.json(commands);
        } catch (error) {
            console.error('getCommands error:', error);
            res.status(500).json({ error: 'Failed to fetch commands' });
        }
    }

    async createCommand(req, res) {
        const { command, classifier, response, section, is_template, bot_id } = req.body;
        try {
            const [id] = await knex('constructor_commands').insert({
                command,
                classifier,
                response,
                section,
                is_template: is_template || (bot_id ? false : true),
                bot_id: bot_id || null
            });
            res.json({ id, success: true });
        } catch (error) {
            res.status(500).json({ error: 'Failed to create command' });
        }
    }

    async updateCommand(req, res) {
        const { id } = req.params;
        const { command, classifier, response, section, is_template, bot_id } = req.body;
        try {
            await knex('constructor_commands')
                .where('id', id)
                .update({
                    command,
                    classifier,
                    response,
                    section,
                    is_template,
                    bot_id,
                    updated_at: knex.fn.now()
                });
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: 'Failed to update command' });
        }
    }

    async deleteCommand(req, res) {
        const { id } = req.params;
        try {
            await knex('constructor_commands').where('id', id).del();
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: 'Failed to delete command' });
        }
    }

    // --- Brain Context Methods (Admin) ---

    /**
     * GET /admin/constructor/brain-contexts
     */
    async getBrainContexts(req, res) {
        try {
            const contexts = await knex('constructor_brain_contexts').orderBy('priority', 'desc');
            res.json(contexts);
        } catch (error) {
            res.status(500).json({ error: 'Failed to get brain contexts' });
        }
    }

    /**
     * POST /admin/constructor/brain-contexts
     */
    async createBrainContext(req, res) {
        const { title, content, is_active, priority } = req.body;
        try {
            const [id] = await knex('constructor_brain_contexts').insert({
                title,
                content,
                is_active: is_active !== undefined ? is_active : true,
                priority: priority || 0
            });
            res.json({ success: true, id });
        } catch (error) {
            res.status(500).json({ error: 'Failed to create brain context' });
        }
    }

    /**
     * PUT /admin/constructor/brain-contexts/:id
     */
    async updateBrainContext(req, res) {
        const { id } = req.params;
        const { title, content, is_active, priority } = req.body;
        try {
            await knex('constructor_brain_contexts')
                .where('id', id)
                .update({
                    title,
                    content,
                    is_active,
                    priority,
                    updated_at: knex.fn.now()
                });
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: 'Failed to update brain context' });
        }
    }

    /**
     * DELETE /admin/constructor/brain-contexts/:id
     */
    async deleteBrainContext(req, res) {
        const { id } = req.params;
        try {
            await knex('constructor_brain_contexts').where('id', id).del();
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: 'Failed to delete brain context' });
        }
    }

    /**
     * POST /webhook/max/:botId
     * Обработка входящих сообщений от MAX Messenger
     */
    async handleMaxWebhook(req, res) {
        const { botId } = req.params;
        const payload = req.body; // Ожидаем JSON от MAX
        const signature = req.headers['x-max-bot-api-secret'];

        try {
            const bot = await knex('constructor_bots').where('id', botId).first();
            if (!bot) {
                console.error(`[MAX Webhook] Bot ${botId} not found`);
                return res.status(404).send('Bot not found');
            }

            // Проверка секрета (если задан)
            if (bot.webhook_secret && bot.webhook_secret !== signature) {
                console.warn(`[MAX Webhook] Invalid secret for bot ${botId}`);
                return res.status(403).send('Invalid secret');
            }

            console.log(`[MAX Webhook] Payload for bot ${botId}:`, JSON.stringify(payload, null, 2));
            console.log(`[MAX Webhook] Received event for bot ${botId}: ${payload.type}`);

            // Самое важное событие - message_created
            if (payload.type === 'message_created') {
                const message = payload.object;
                const userId = message.sender?.id;
                const nickname = message.sender?.name || message.sender?.nick || userId;
                const text = message.text;

                if (userId && text) {
                    const constructorAiService = require('../services/constructorAiService');
                    const response = await constructorAiService.processMessage(
                        bot.id,
                        userId.toString(),
                        nickname,
                        text
                    );

                    // Отправляем ответ (текст или объект с документом)
                    const constructorBotService = require('../services/constructorBotService');
                    const messageContent = typeof response === 'object' ? response : { text: response };
                    await constructorBotService.sendMessageToClient(bot.id, userId, messageContent);

                    // Если был документ, он уже отправлен, но его нужно удалить (хотя ConstructorBotService для Telegram это делает сам, для MAX я этого не добавил)
                    // Добавим очистку в ConstructorBotService.sendMessageToClient для MAX или здесь.
                    if (typeof response === 'object' && response.document) {
                        const fs = require('fs');
                        fs.unlink(response.document, (err) => {
                            if (err) console.error('[MAX] Cleanup failed:', err);
                        });
                    }
                }
            }

            // MAX ожидает 200 OK в ответ на вебхук
            res.status(200).json({ success: true });
        } catch (error) {
            console.error(`[MAX Webhook] Internal Error:`, error);
            res.status(500).send('Internal Server Error');
        }
    }
}

module.exports = new ConstructorController();
