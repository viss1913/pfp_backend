const crypto = require('crypto');
const path = require('path');
const knex = require('../config/database');
const constructorBotService = require('../services/constructorBotService');
const maxBotService = require('../services/maxBotService');
const {
    uploadPublicFile,
    deleteObjectByKey,
    isR2ClientReady,
    isStorageUploadRequireR2,
} = require('../utils/r2Client');
const {
    parseCommandMedia,
    normalizeCommandMediaForDb,
    inferMediaType,
    commandKeyToSlug,
    enrichCommandRow,
    MAX_MEDIA_PER_COMMAND,
} = require('../utils/constructorCommandMedia');
const {
    resolveProjectId,
    findBotInProject,
    findCommandInProject,
} = require('../utils/constructorCommandAccess');
const {
    findProjectBot,
    listProjectMessengerBots,
    projectBotIds,
    clientBelongsToProject,
} = require('../utils/constructorProjectBot');

class ConstructorController {
    // --- Agent Methods ---

    /**
     * POST /pfp/constructor/bot
     * Регистрация или обновление бота проекта (один telegram/max на project_id; любой агент проекта)
     */
    async registerBot(req, res) {
        const agentId = req.user.agentId || req.user.id;
        const projectId = resolveProjectId(req) || req.user?.projectId;
        const { name, link, token, communication_style, base_brain_context, bot_type, webhook_secret } = req.body;

        try {
            if (!projectId) {
                return res.status(400).json({ error: 'project_id not resolved' });
            }

            const type = bot_type || 'telegram';
            let bot = await findProjectBot(projectId, type);

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
                        project_id: projectId,
                        updated_at: knex.fn.now(),
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
                    base_brain_context,
                });
                bot = { id };
            }

            await constructorBotService.restartBot(bot.id);

            res.json({ success: true, message: 'Bot registered and started', bot_id: bot.id, scope: 'project' });
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
     * Бот(ы) проекта — общие для всех агентов tenant (telegram, max; без site)
     */
    async getMyBot(req, res) {
        const projectId = resolveProjectId(req) || req.user?.projectId;
        const { bot_type } = req.query;

        try {
            if (!projectId) {
                return res.status(400).json({ error: 'project_id not resolved' });
            }

            if (bot_type) {
                const bot = await findProjectBot(projectId, bot_type);
                return res.json(bot ? { ...bot, scope: 'project' } : {});
            }

            const bots = await listProjectMessengerBots(projectId);
            res.json(bots.map((b) => ({ ...b, scope: 'project' })));
        } catch (error) {
            res.status(500).json({ error: 'Failed to get bots' });
        }
    }

    /**
     * GET /pfp/constructor/clients
     */
    async getMyClients(req, res) {
        const projectId = resolveProjectId(req) || req.user?.projectId;
        const { bot_id } = req.query;

        try {
            if (!projectId) {
                return res.status(400).json({ error: 'project_id not resolved' });
            }

            let botIds = await projectBotIds(projectId);
            if (bot_id) {
                const allowed = await findBotInProject(bot_id, projectId);
                if (!allowed) return res.status(404).json({ error: 'Bot not found in this project' });
                botIds = [allowed.id];
            }

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
        const projectId = resolveProjectId(req) || req.user?.projectId;
        const { clientId } = req.params;

        try {
            if (!projectId) {
                return res.status(400).json({ error: 'project_id not resolved' });
            }

            const client = await clientBelongsToProject(clientId, projectId);
            if (!client) {
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
        const projectId = resolveProjectId(req) || req.user?.projectId;
        const { clientId, text, photo, video, voice, audio, document } = req.body;

        try {
            if (!projectId) {
                return res.status(400).json({ error: 'project_id not resolved' });
            }

            const client = await clientBelongsToProject(clientId, projectId);
            if (!client) {
                return res.status(403).json({ error: 'Access denied' });
            }

            const result = await constructorBotService.sendMessageToClient(client.bot_id, client.user_id, {
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
        const projectId = resolveProjectId(req) || req.user?.projectId;
        const { text, photo, video, voice, audio, document, bot_type } = req.body;

        try {
            if (!projectId) {
                return res.status(400).json({ error: 'project_id not resolved' });
            }

            const bot = await findProjectBot(projectId, bot_type || 'telegram');
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
     * Шаблоны проекта (is_template + project_id) или команды бота.
     * По умолчанию без bot_id — только шаблоны текущего project_id (партнёр настраивает один раз на проект).
     * С bot_id — команды бота + шаблоны проекта (агенты видят полный CJM).
     */
    async getCommands(req, res) {
        const { bot_id, is_template, include_project_templates } = req.query;
        const projectId = resolveProjectId(req);
        try {
            if (!projectId) {
                return res.status(400).json({ error: 'project_id not resolved (x-project-key or user token)' });
            }

            let query = knex('constructor_commands');

            if (bot_id) {
                const bot = await findBotInProject(bot_id, projectId);
                if (!bot) {
                    return res.status(404).json({ error: 'Bot not found in this project' });
                }
                const withProjectTemplates = include_project_templates !== 'false' && include_project_templates !== '0';
                if (withProjectTemplates) {
                    query = query.where(function () {
                        this.where('bot_id', bot.id).orWhere(function () {
                            this.where({ is_template: true, project_id: projectId });
                        });
                    });
                } else {
                    query = query.where('bot_id', bot.id);
                }
            } else if (is_template !== undefined) {
                query = query
                    .where('is_template', is_template === 'true' || is_template === true)
                    .andWhere('project_id', projectId);
            } else {
                query = query.where({ is_template: true, project_id: projectId });
            }

            const commands = await query.orderByRaw('is_template ASC, bot_id DESC, created_at DESC');
            res.json(commands.map(enrichCommandRow));
        } catch (error) {
            console.error('getCommands error:', error);
            res.status(500).json({ error: 'Failed to fetch commands' });
        }
    }

    async createCommand(req, res) {
        const { command, classifier, response, section, is_template, bot_id, media } = req.body;
        const projectId = resolveProjectId(req);
        try {
            if (!projectId) {
                return res.status(400).json({ error: 'project_id not resolved (x-project-key or user token)' });
            }

            let mediaValue;
            try {
                mediaValue = normalizeCommandMediaForDb(media);
            } catch (mediaErr) {
                return res.status(400).json({ error: mediaErr.message });
            }

            const wantsProjectTemplate = is_template === true || is_template === 'true' || (!bot_id && is_template !== false);
            const baseRow = {
                command,
                classifier,
                response,
                section,
                ...(mediaValue !== undefined ? { media: JSON.stringify(mediaValue) } : {}),
            };

            if (wantsProjectTemplate) {
                const [id] = await knex('constructor_commands').insert({
                    ...baseRow,
                    is_template: true,
                    bot_id: null,
                    project_id: projectId,
                });
                return res.json({ id, success: true, scope: 'project' });
            }

            if (!bot_id) {
                return res.status(400).json({ error: 'bot_id is required for bot-specific commands' });
            }

            const bot = await findBotInProject(bot_id, projectId);
            if (!bot) {
                return res.status(404).json({ error: 'Bot not found in this project' });
            }

            const [id] = await knex('constructor_commands').insert({
                ...baseRow,
                is_template: false,
                bot_id: bot.id,
                project_id: projectId,
            });
            res.json({ id, success: true, scope: 'bot' });
        } catch (error) {
            console.error('createCommand error:', error);
            res.status(500).json({ error: 'Failed to create command' });
        }
    }

    async updateCommand(req, res) {
        const { id } = req.params;
        const { command, classifier, response, section, is_template, bot_id, media } = req.body;
        const projectId = resolveProjectId(req);
        try {
            if (!projectId) {
                return res.status(400).json({ error: 'project_id not resolved (x-project-key or user token)' });
            }

            const existing = await findCommandInProject(id, projectId);
            if (!existing) {
                return res.status(404).json({ error: 'Command not found in this project' });
            }

            let mediaValue;
            try {
                mediaValue = normalizeCommandMediaForDb(media);
            } catch (mediaErr) {
                return res.status(400).json({ error: mediaErr.message });
            }

            const patch = {
                command,
                classifier,
                response,
                section,
                updated_at: knex.fn.now(),
            };
            if (mediaValue !== undefined) {
                patch.media = mediaValue == null ? null : JSON.stringify(mediaValue);
            }

            if (existing.is_template) {
                patch.is_template = true;
                patch.bot_id = null;
                patch.project_id = projectId;
            } else {
                patch.is_template = false;
                if (bot_id != null && Number(bot_id) !== Number(existing.bot_id)) {
                    const bot = await findBotInProject(bot_id, projectId);
                    if (!bot) {
                        return res.status(404).json({ error: 'Bot not found in this project' });
                    }
                    patch.bot_id = bot.id;
                }
                patch.project_id = projectId;
            }

            await knex('constructor_commands').where('id', id).update(patch);
            res.json({ success: true });
        } catch (error) {
            console.error('updateCommand error:', error);
            res.status(500).json({ error: 'Failed to update command' });
        }
    }

    /**
     * POST /commands/:id/media
     * Загрузка картинки или видео к стадии CJM (R2).
     */
    async uploadCommandMedia(req, res) {
        const { id } = req.params;
        const projectId = resolveProjectId(req);
        try {
            if (!projectId) {
                return res.status(400).json({ error: 'project_id not resolved (x-project-key or user token)' });
            }
            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded. Use field name "file".' });
            }

            const existing = await findCommandInProject(id, projectId);
            if (!existing) {
                return res.status(404).json({ error: 'Command not found in this project' });
            }

            const media = parseCommandMedia(existing.media);
            if (media.length >= MAX_MEDIA_PER_COMMAND) {
                return res.status(400).json({
                    error: `Не больше ${MAX_MEDIA_PER_COMMAND} файлов на команду`,
                });
            }

            const type = inferMediaType(req.file.mimetype, req.file.originalname);
            if (!type) {
                return res.status(400).json({ error: 'Неподдерживаемый тип файла' });
            }

            const ext = path.extname(req.file.originalname || '') || (type === 'video' ? '.mp4' : '.webp');
            const slug = commandKeyToSlug(existing.command);
            const key = `constructor-commands/${projectId}/${slug}/${Date.now()}_${crypto.randomUUID()}${ext}`;

            const up = await uploadPublicFile({
                key,
                body: req.file.buffer,
                contentType:
                    req.file.mimetype ||
                    (type === 'video' ? 'video/mp4' : type === 'document' ? 'application/pdf' : 'image/webp'),
            });

            if (!up.ok) {
                if (up.reason === 'r2_public_url_missing' || (isR2ClientReady() && up.reason === 'r2_put_failed')) {
                    return res.status(503).json({
                        error:
                            up.reason === 'r2_public_url_missing'
                                ? 'R2: не задан публичный URL (R2_PUBLIC_BASE_URL / R2_CDN_BASE_URL / R2_PUBLIC_DOMAIN)'
                                : 'Загрузка в Cloudflare R2 не удалась',
                        code: up.reason === 'r2_public_url_missing' ? 'R2_PUBLIC_URL_MISSING' : 'R2_PUT_FAILED',
                        detail: up.detail || undefined,
                    });
                }
                if (isStorageUploadRequireR2()) {
                    return res.status(503).json({
                        error: 'Cloudflare R2 is required (STORAGE_REQUIRE_R2) but upload failed',
                        code: 'STORAGE_R2_REQUIRED',
                        reason: up.reason || 'unknown',
                    });
                }
                return res.status(503).json({ error: 'Storage upload failed', reason: up.reason });
            }

            const item = {
                id: crypto.randomUUID(),
                type,
                url: up.url,
                key,
                filename: req.file.originalname || null,
                mime: req.file.mimetype || null,
                caption: typeof req.body.caption === 'string' ? req.body.caption.trim() : '',
                sort: media.length,
            };
            const nextMedia = [...media, item];

            await knex('constructor_commands').where('id', id).update({
                media: JSON.stringify(nextMedia),
                updated_at: knex.fn.now(),
            });

            return res.status(201).json({
                success: true,
                media: item,
                all: nextMedia,
            });
        } catch (error) {
            console.error('uploadCommandMedia error:', error);
            res.status(500).json({ error: 'Failed to upload command media' });
        }
    }

    /**
     * DELETE /commands/:id/media/:mediaId
     */
    async deleteCommandMedia(req, res) {
        const { id, mediaId } = req.params;
        const projectId = resolveProjectId(req);
        try {
            if (!projectId) {
                return res.status(400).json({ error: 'project_id not resolved (x-project-key or user token)' });
            }

            const existing = await findCommandInProject(id, projectId);
            if (!existing) {
                return res.status(404).json({ error: 'Command not found in this project' });
            }

            const media = parseCommandMedia(existing.media);
            const target = media.find((m) => m.id === mediaId);
            if (!target) {
                return res.status(404).json({ error: 'Media not found on this command' });
            }

            const nextMedia = media.filter((m) => m.id !== mediaId);
            await knex('constructor_commands').where('id', id).update({
                media: nextMedia.length ? JSON.stringify(nextMedia) : null,
                updated_at: knex.fn.now(),
            });

            if (target.key) {
                deleteObjectByKey(target.key).catch((err) => {
                    console.warn('[Constructor] R2 delete after media remove failed:', err.message || err);
                });
            }

            res.json({ success: true, all: nextMedia });
        } catch (error) {
            console.error('deleteCommandMedia error:', error);
            res.status(500).json({ error: 'Failed to delete command media' });
        }
    }

    async deleteCommand(req, res) {
        const { id } = req.params;
        const projectId = resolveProjectId(req);
        try {
            if (!projectId) {
                return res.status(400).json({ error: 'project_id not resolved (x-project-key or user token)' });
            }

            const existing = await findCommandInProject(id, projectId);
            if (!existing) {
                return res.status(404).json({ error: 'Command not found in this project' });
            }

            for (const item of parseCommandMedia(existing.media)) {
                if (item.key) {
                    deleteObjectByKey(item.key).catch(() => {});
                }
            }

            await knex('constructor_commands').where('id', id).del();
            res.json({ success: true });
        } catch (error) {
            console.error('deleteCommand error:', error);
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
     * События: type=session|classifier_command|persist_status|pfp_client|pdf_url|text|calc_error|done|error.
     * persist_status: { status: ok|skipped|failed, reason?, ... } — диагностика CRM/PDF до стрима LLM.
     * При успехе: затем pfp_client, pdf_url (если есть URL); в конце стрима дублируются pdf_url и type=text со ссылкой на PDF.
     * При провале first-run расчёта: type=calc_error, поля text и error_code=FIRST_RUN_CALC_FAILED (без LLM-«плана»).
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

            let createdNewSiteSession = false;
            // Если сессии нет — создаём UUID + cookie (на кросс-домене кука часто не прилетает — фронт обязан слать sessionId из тела/заголовка).
            if (!userSessionId) {
                const crypto = require('crypto');
                userSessionId = crypto.randomUUID();
                createdNewSiteSession = true;
                res.setHeader(
                    'Set-Cookie',
                    `constructor_site_sid=${encodeURIComponent(userSessionId)}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`
                );
                console.warn(
                    '[Constructor Site Chat] Новый anonymous sessionId (нет cookie/body/x-constructor-session-id). ' +
                        'Если следующий запрос снова без id — будет новая constructor_sessions и чат «с нуля». ' +
                        `sessionId=${userSessionId}, projectId=${projectId}`
                );
            }

            // Сразу после фиксации id — чтобы фронт мог сохранить до ошибки «пустое сообщение».
            res.write(`data: ${JSON.stringify({ type: 'session', sessionId: userSessionId, new: createdNewSiteSession })}\n\n`);

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
                bot = await constructorBotService.ensureSiteChatBot(projectId);
            }

            if (!bot) {
                res.write(
                    `data: ${JSON.stringify({
                        error: 'constructor bot not found for project',
                        hint: 'В проекте нет агентов (agents/users с этим project_id). Добавь агента в проект или зарегистрируй бота в ЛК.',
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

    /**
     * GET /api/pfp/constructor/site-chat/report-pdf?t=...
     * PDF по подписанному JWT из цепочки site-chat (fallback, если нет публичного URL в R2).
     */
    async getSiteChatReportPdf(req, res) {
        const reportPdfService = require('../services/reportPdfService');
        const { verifySiteChatReportPdfToken } = require('../services/constructorSiteReportPdfTokenService');
        try {
            const token = (req.query.t || req.query.token || '').toString().trim();
            if (!token) {
                res.status(400).json({ error: 'Missing token (query t)' });
                return;
            }
            const { clientId, projectId } = verifySiteChatReportPdfToken(token);
            const client = await knex('clients').where({ id: clientId, project_id: projectId }).first();
            if (!client) {
                res.status(404).json({ error: 'Client not found' });
                return;
            }
            const agentId =
                client.agent_id != null && client.agent_id !== '' && Number.isFinite(Number(client.agent_id))
                    ? Number(client.agent_id)
                    : undefined;
            const pdfBuffer = await reportPdfService.generateClientReportPdf({
                clientId,
                projectId,
                includeCover: true,
                includeSummary: true,
                goalTypes: null,
                agentId,
            });
            const ts = new Date().toISOString().slice(0, 10);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader(
                'Content-Disposition',
                `inline; filename="report-client-${clientId}-${ts}.pdf"`
            );
            res.setHeader('Cache-Control', 'private, no-store');
            res.send(pdfBuffer);
        } catch (error) {
            const code = Number(error.statusCode) || 500;
            if (code === 401 || code === 400 || code === 404 || code === 503) {
                res.status(code).json({ error: error.message || 'Request failed' });
                return;
            }
            console.error('[Constructor] getSiteChatReportPdf:', error);
            res.status(500).json({ error: error.message || 'PDF generation failed' });
        }
    }
}

module.exports = new ConstructorController();
