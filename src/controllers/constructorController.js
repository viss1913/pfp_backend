const knex = require('../config/database');
const constructorBotService = require('../services/constructorBotService');
const maxBotService = require('../services/maxBotService');

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
        const projectId = req.projectId || req.user?.projectId;
        try {
            let query = knex('constructor_commands');

            if (bot_id) {
                query = query.where('bot_id', bot_id);
            } else if (is_template !== undefined) {
                query = query.where('is_template', is_template === 'true' || is_template === true);
                if (projectId) query = query.andWhere('project_id', projectId);
            } else {
                // По умолчанию возвращаем шаблоны текущего проекта
                query = query.where('is_template', true);
                if (projectId) query = query.andWhere('project_id', projectId);
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
        const projectId = req.projectId || req.user?.projectId;
        try {
            const [id] = await knex('constructor_commands').insert({
                command,
                classifier,
                response,
                section,
                is_template: is_template || (bot_id ? false : true),
                bot_id: bot_id || null,
                project_id: projectId || null
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
        const projectId = req.projectId || req.user?.projectId;
        try {
            const query = knex('constructor_brain_contexts');
            if (projectId) {
                query.where('project_id', projectId);
            }
            const contexts = await query.orderBy('priority', 'desc');
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
        const projectId = req.projectId || req.user?.projectId;
        try {
            const [id] = await knex('constructor_brain_contexts').insert({
                title,
                content,
                is_active: is_active !== undefined ? is_active : true,
                priority: priority || 0,
                project_id: projectId || null
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

            // Проверяем тип события (в реальном логе это update_type)
            const eventType = payload.update_type || payload.type;
            console.log(`[MAX Webhook] Received event for bot ${botId}: ${eventType}`);

            // Ответ 200 OK немедленно, чтобы MAX Hub не делал повторных запросов (retry) из-за ожидания ИИ
            res.status(200).json({ status: 'ok' });

            // Асинхронная обработка (не блокирует ответ вебхуку)
            (async () => {
                try {
                    // Обработка событий
                    let chatId, userId, nickname, text;

                    if (eventType === 'message_created' && payload.message) {
                        const message = payload.message;
                        chatId = message.recipient?.chat_id;
                        userId = message.sender?.user_id || message.sender?.id;
                        nickname = message.sender?.name || message.sender?.first_name || userId;
                        text = message.body?.text || message.text;
                    } else if (eventType === 'bot_started') {
                        chatId = payload.chat_id;
                        userId = payload.user?.user_id || payload.user?.id;
                        nickname = payload.user?.name || payload.user?.first_name || userId;
                        text = '/start';
                    }

                    if (chatId && text) {
                        // «Печатает...» пока бот обрабатывает сообщение
                        maxBotService.sendChatAction(bot.token, chatId, 'typing_on').catch(() => {});
                        const typingInterval = setInterval(() => {
                            maxBotService.sendChatAction(bot.token, chatId, 'typing_on').catch(() => {});
                        }, 4000);

                        const constructorAiService = require('../services/constructorAiService');
                        let response;
                        try {
                            response = await constructorAiService.processMessage(
                                bot.id,
                                chatId.toString(),
                                nickname,
                                text
                            );
                        } finally {
                            clearInterval(typingInterval);
                        }

                        const constructorBotService = require('../services/constructorBotService');
                        const messageContent = typeof response === 'object' ? response : { text: response };
                        await constructorBotService.sendMessageToClient(bot.id, chatId, messageContent);

                        if (typeof response === 'object' && response.document) {
                            const fs = require('fs');
                            fs.unlink(response.document, (err) => {
                                if (err) console.error('[MAX] Cleanup failed:', err);
                            });
                        }
                    }
                } catch (asyncError) {
                    console.error(`[MAX Webhook Async Error] Bot ${botId}:`, asyncError);
                }
            })();

        } catch (error) {
            console.error(`[MAX Webhook] Internal Error:`, error);
            // Если упало до отправки заголовков
            if (!res.headersSent) {
                res.status(500).send('Internal Server Error');
            }
        }
    }

    /**
     * POST /pfp/constructor/site-chat/stream
     * Чат на сайте без регистрации: выбираем project по x-project-key (tenantMiddleware),
     * сессию — по sessionId/куке (используем как user_id в constructor_clients),
     * ответ стримим как SSE.
     */
    async handleSiteChatStream(req, res) {
        const knex = require('../config/database');
        try {
            // SSE headers
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');

            const projectId = req.projectId;
            if (!projectId) {
                res.write(`data: ${JSON.stringify({ error: 'project_id not resolved from x-project-key' })}\n\n`);
                res.end();
                return;
            }

            const { sessionId: bodySessionId, session_id, text, message, nickname } = req.body || {};
            const cookieHeader = req.headers.cookie || '';
            const cookieMatch = cookieHeader.match(/(?:^|;\s*)constructor_site_sid=([^;]+)/);
            const cookieSessionId = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;

            let userSessionId =
                bodySessionId ||
                session_id ||
                req.headers['x-constructor-session-id'] ||
                cookieSessionId ||
                null;

            // Если сессии нет — создаём и отдаём фронту первым SSE-ивентом + cookie.
            if (!userSessionId) {
                const crypto = require('crypto');
                userSessionId = crypto.randomUUID();
                res.setHeader(
                    'Set-Cookie',
                    `constructor_site_sid=${encodeURIComponent(userSessionId)}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`
                );
                res.write(`data: ${JSON.stringify({ type: 'session', sessionId: userSessionId })}\n\n`);
            }

            const userMessage = (text || message || '').toString().trim();
            if (!userMessage) {
                res.write(`data: ${JSON.stringify({ error: 'message/text is required' })}\n\n`);
                res.end();
                return;
            }

            const bodyBotId = req.body?.bot_id ?? req.body?.botId ?? req.query?.bot_id;
            let bot = null;

            if (bodyBotId) {
                bot = await knex('constructor_bots')
                    .where('id', bodyBotId)
                    .where(function () {
                        this.where('project_id', projectId).orWhereNull('project_id');
                    })
                    .first();
                if (!bot) {
                    bot = await knex('constructor_bots')
                        .join('agents', 'constructor_bots.agent_id', 'agents.id')
                        .where('constructor_bots.id', bodyBotId)
                        .where('agents.project_id', projectId)
                        .select('constructor_bots.*')
                        .first();
                }
                if (!bot) {
                    res.write(
                        `data: ${JSON.stringify({
                            error: 'constructor bot not found',
                            hint: `bot_id ${bodyBotId} is not in this project`,
                        })}\n\n`
                    );
                    res.end();
                    return;
                }
            }

            if (!bot) {
                // 1) Явный project_id на боте
                let bots = await knex('constructor_bots')
                    .where({ project_id: projectId, is_active: true })
                    .orderBy('created_at', 'desc');

                // 2) У старых ботов project_id мог быть null — тянем по agents.project_id
                if (!bots.length) {
                    bots = await knex('constructor_bots')
                        .join('agents', 'constructor_bots.agent_id', 'agents.id')
                        .where('agents.project_id', projectId)
                        .where('constructor_bots.is_active', true)
                        .select('constructor_bots.*')
                        .orderBy('constructor_bots.created_at', 'desc');
                }

                bot = bots.find((b) => b.bot_type === 'site') || bots[0];
            }

            // 3) Все боты выключены (is_active=false) — всё равно пробуем, иначе сайт молчит
            if (!bot) {
                let bots = await knex('constructor_bots')
                    .where({ project_id: projectId })
                    .orderBy('created_at', 'desc');
                if (!bots.length) {
                    bots = await knex('constructor_bots')
                        .join('agents', 'constructor_bots.agent_id', 'agents.id')
                        .where('agents.project_id', projectId)
                        .select('constructor_bots.*')
                        .orderBy('constructor_bots.created_at', 'desc');
                }
                bot = bots.find((b) => b.bot_type === 'site') || bots[0];
            }

            if (!bot) {
                res.write(
                    `data: ${JSON.stringify({
                        error: 'constructor bot not found for project',
                        hint: 'Register a bot via POST /api/pfp/constructor/bot (agent LK) or pass bot_id in body/query if the bot exists but project_id was not set on the row.',
                    })}\n\n`
                );
                res.end();
                return;
            }

            const constructorAiService = require('../services/constructorAiService');
            await constructorAiService.processMessageStream(
                bot.id,
                userSessionId,
                nickname || null,
                userMessage,
                res
            );
            // Дальше res.end() делает aiService.streamCompletion (или наш /reset путь).
        } catch (error) {
            console.error('[Constructor Site Chat Stream] Error:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Site chat failed' });
            } else {
                res.write(`data: ${JSON.stringify({ error: 'Site chat failed' })}\n\n`);
                res.end();
            }
        }
    }
}

module.exports = new ConstructorController();
