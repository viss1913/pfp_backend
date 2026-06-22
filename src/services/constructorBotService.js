const crypto = require('crypto');
const TelegramBot = require('node-telegram-bot-api');
const knex = require('../config/database');
const constructorAiService = require('./constructorAiService');
const maxBotService = require('./maxBotService');
const { telegramBotOptions, telegramProxyRequestOptions, probeTelegramEgress, logTelegramEgressProbe } = require('../utils/telegramProxy');
const { callTelegramApi, withChatHandlerTimeout, isUncertainTelegramDeliveryError } = require('../utils/telegramSend');

const TELEGRAM_TEXT_CHUNK = 4000;

/**
 * Экранирует подчёркивания в Telegram Markdown (legacy). Предпочтительно plain text — см. sendTelegramTextMessage.
 */
function escapeMarkdown(text) {
    if (typeof text !== 'string') return text;
    return text.replace(/\\/g, '\\\\').replace(/_/g, '\\_');
}

function isTelegramParseEntitiesError(err) {
    const msg = String(err?.message || err?.response?.body?.description || '');
    return /can't parse entities|parse entities/i.test(msg);
}

function splitTelegramText(text) {
    if (text.length <= TELEGRAM_TEXT_CHUNK) return [text];
    const chunks = [];
    for (let i = 0; i < text.length; i += TELEGRAM_TEXT_CHUNK) {
        chunks.push(text.slice(i, i + TELEGRAM_TEXT_CHUNK));
    }
    return chunks;
}

/** Constructor bot: plain text only — LLM часто ломает legacy Markdown списками с «*». */
async function sendTelegramTextMessage(botInstance, chatId, text, { plain = true } = {}) {
    if (!text) return;
    const chunks = splitTelegramText(text);
    for (const chunk of chunks) {
        if (plain) {
            await callTelegramApi(
                () => botInstance.sendMessage(chatId, chunk),
                `sendMessage chat=${chatId}`
            );
            continue;
        }
        try {
            await callTelegramApi(
                () => botInstance.sendMessage(chatId, escapeMarkdown(chunk), { parse_mode: 'Markdown' }),
                `sendMessage markdown chat=${chatId}`
            );
        } catch (err) {
            if (isTelegramParseEntitiesError(err)) {
                console.warn('[Telegram] Markdown parse failed, retrying as plain text');
                await callTelegramApi(
                    () => botInstance.sendMessage(chatId, chunk),
                    `sendMessage plain-retry chat=${chatId}`
                );
                continue;
            }
            throw err;
        }
    }
}

async function sendTelegramMediaItems(botInstance, chatId, media = []) {
    const sorted = [...media].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
    if (!sorted.length) return;
    console.log(`[Telegram] Sending ${sorted.length} stage media item(s) to chat ${chatId}`);
    const hasDocument = sorted.some((item) => item?.type === 'document');
    const chatAction = hasDocument ? 'upload_document' : 'upload_photo';
    await callTelegramApi(
        () => botInstance.sendChatAction(chatId, chatAction),
        `sendChatAction ${chatAction} chat=${chatId}`
    ).catch(() => { });
    for (const item of sorted) {
        const url = item?.url;
        if (!url) continue;
        const caption = item.caption ? escapeMarkdown(item.caption) : undefined;
        const opts = caption ? { caption, parse_mode: 'Markdown' } : {};
        const plainOpts = caption ? { caption: item.caption } : {};
        try {
            if (item.type === 'document') {
                await callTelegramApi(
                    () => botInstance.sendDocument(chatId, url, opts),
                    `sendDocument chat=${chatId}`
                );
            } else if (item.type === 'video') {
                await callTelegramApi(
                    () => botInstance.sendVideo(chatId, url, opts),
                    `sendVideo chat=${chatId}`
                );
            } else {
                await callTelegramApi(
                    () => botInstance.sendPhoto(chatId, url, opts),
                    `sendPhoto chat=${chatId}`
                );
            }
        } catch (err) {
            if (caption && isTelegramParseEntitiesError(err)) {
                if (item.type === 'document') {
                    await callTelegramApi(
                        () => botInstance.sendDocument(chatId, url, plainOpts),
                        `sendDocument plain-retry chat=${chatId}`
                    );
                } else if (item.type === 'video') {
                    await callTelegramApi(
                        () => botInstance.sendVideo(chatId, url, plainOpts),
                        `sendVideo plain-retry chat=${chatId}`
                    );
                } else {
                    await callTelegramApi(
                        () => botInstance.sendPhoto(chatId, url, plainOpts),
                        `sendPhoto plain-retry chat=${chatId}`
                    );
                }
                continue;
            }
            console.error(`[Telegram] Failed to send stage media (${url}):`, err.message || err);
            throw err;
        }
        console.log(`[Telegram] Sent stage media (${item.type}) to chat ${chatId}`);
    }
}

async function deliverTelegramResponse(botInstance, chatId, response) {
    if (typeof response === 'string') {
        await sendTelegramTextMessage(botInstance, chatId, response);
        console.log(`[Telegram] Sent text to chat ${chatId} (${response.length} chars)`);
        return;
    }

    const { text = '', document, media, plain } = response;

    // Сначала текст — даже если PDF/медиа через прокси подвиснут, пользователь не остаётся без ответа.
    if (text) {
        await sendTelegramTextMessage(botInstance, chatId, text, { plain });
        console.log(`[Telegram] Sent text to chat ${chatId} (${text.length} chars)`);
    }

    if (media?.length) {
        try {
            await sendTelegramMediaItems(botInstance, chatId, media);
        } catch (err) {
            console.error(
                `[Telegram] Stage media failed for chat ${chatId} (text already sent):`,
                err.message || err
            );
        }
    }

    if (document) {
        try {
            await callTelegramApi(
                () => botInstance.sendDocument(chatId, document),
                `sendDocument file chat=${chatId}`
            );
        } catch (err) {
            console.error(
                `[Telegram] Document file failed for chat ${chatId} (text already sent):`,
                err.message || err
            );
        }
    }
}

/** Токен недействителен или бот удалён в Telegram — дальше polling бессмысленен. */
function isTelegramBotGoneError(error) {
    const msg = String(error?.message || '');
    if (msg.includes('401') || msg.includes('Unauthorized')) return true;
    if (msg.includes('404') || /404\s+not\s+found/i.test(msg)) return true;
    const status = error?.response?.statusCode ?? error?.response?.status;
    return status === 401 || status === 404;
}

class ConstructorBotService {
    constructor() {
        this.bots = new Map(); // botId -> { instance, token, type, secret }
        /** Очередь на chatId: без неё параллельные handlers крутят sendChatAction(typing) вечно. */
        this.chatQueues = new Map(); // `${botId}:${chatId}` -> Promise
    }

    _runQueuedChatTask(queueKey, task) {
        const prev = this.chatQueues.get(queueKey) || Promise.resolve();
        const run = prev
            .catch(() => {})
            .then(() =>
                withChatHandlerTimeout(Promise.resolve().then(task), queueKey).catch((err) => {
                    console.error(`[Telegram] Chat task failed (${queueKey}):`, err.message || err);
                })
            );
        this.chatQueues.set(
            queueKey,
            run.finally(() => {
                if (this.chatQueues.get(queueKey) === run) {
                    this.chatQueues.delete(queueKey);
                }
            })
        );
        return run;
    }

    /**
     * Инициализация всех активных ботов при старте сервера
     */
    async initAllBots() {
        console.log('🤖 Initializing AI Constructor Bots...');
        try {
            const probe = await probeTelegramEgress();
            logTelegramEgressProbe(probe);

            const activeBots = await knex('constructor_bots').where('is_active', true);
            const totalBots = await knex('constructor_bots').count('* as count').first();
            console.log(`📊 Found ${activeBots.length} active bots out of ${totalBots.count} total`);
            for (const botData of activeBots) {
                await this.startBot(botData);
            }
            console.log(`✅ Loaded ${this.bots.size} bots.`);
        } catch (error) {
            console.error('❌ Failed to init bots:', error);
        }
    }

    /**
     * Запуск конкретного бота
     */
    async startBot(botData) {
        if (this.bots.has(botData.id)) {
            await this.stopBot(botData.id);
        }

        try {
            if (!botData.bot_type || botData.bot_type === 'telegram') {
                // --- TELEGRAM ---
                const botInstance = new TelegramBot(botData.token, telegramBotOptions());

                botInstance.on('message', async (msg) => {
                    await this.handleTelegramMessage(botData, botInstance, msg);
                });

                let lastPollingErrorLog = 0;
                botInstance.on('polling_error', (error) => {
                    const now = Date.now();
                    if (now - lastPollingErrorLog > 5000) {
                        lastPollingErrorLog = now;
                        console.error(`Polling error for bot ${botData.id}:`, error.code, error.message || '');
                    }
                    if (isTelegramBotGoneError(error)) {
                        const msg = String(error?.message || '');
                        const st = error?.response?.statusCode ?? error?.response?.status;
                        const reason = msg.includes('404') || st === 404
                            ? 'bot removed or token invalid (404)'
                            : 'invalid or unauthorized token (401)';
                        this.stopBot(botData.id);
                        knex('constructor_bots').where('id', botData.id).update({ is_active: false }).catch(console.error);
                        console.error(`🚫 Bot ${botData.id} deactivated: ${reason}`);
                    }
                });

                this.bots.set(botData.id, { instance: botInstance, token: botData.token, type: 'telegram' });
                console.log(`🚀 Telegram Bot "${botData.name}" (ID: ${botData.id}) started.`);
                try {
                    const me = await callTelegramApi(
                        () => botInstance.getMe(),
                        `getMe bot=${botData.id}`,
                        { retryOnTimeout: true }
                    );
                    console.log(`[Telegram] Bot ${botData.id} health OK @${me.username}`);
                } catch (healthErr) {
                    console.error(
                        `[Telegram] Bot ${botData.id} getMe failed (check TELEGRAM_PROXY_URL):`,
                        healthErr.message || healthErr
                    );
                }
            } else if (botData.bot_type === 'max') {
                // --- MAX ---
                // Для MAX мы просто регистрируем вебхук. Сами сообщения придут в контроллер.
                // Генерируем секрет для вебхука, если его нет (можно использовать id бота или токен)
                const secret = botData.webhook_secret || `max-secret-${botData.id}`;

                // ВАЖНО: URL должен быть публично доступным.
                // В реальном приложении это будет https://domain.com/api/constructor/webhook/max/BOT_ID
                let baseUrl = process.env.BASE_URL;
                if (baseUrl && !baseUrl.startsWith('http')) {
                    baseUrl = `https://${baseUrl}`;
                }
                if (baseUrl && baseUrl.endsWith('/')) {
                    baseUrl = baseUrl.slice(0, -1);
                }

                const webhookUrl = baseUrl
                    ? `${baseUrl}/api/pfp/constructor/webhook/max/${botData.id}`
                    : null;

                if (webhookUrl) {
                    await maxBotService.setWebhook(botData.token, webhookUrl, secret);
                }

                this.bots.set(botData.id, { token: botData.token, type: 'max', secret: secret });
                console.log(`🚀 MAX Bot "${botData.name}" (ID: ${botData.id}) configured.`);
            }
        } catch (error) {
            console.error(`❌ Failed to start bot ${botData.id}:`, error.message);
        }
    }

    /**
     * Обработка сообщения из Telegram (с очередью на чат — одно сообщение за раз).
     */
    async handleTelegramMessage(botData, botInstance, msg) {
        console.log(`[Telegram] Received message from ${msg.from.id}: "${msg.text}"`);
        if (!msg.text) return;

        const queueKey = `${botData.id}:${msg.chat.id}`;
        return this._runQueuedChatTask(queueKey, () =>
            this._handleTelegramMessageInner(botData, botInstance, msg)
        );
    }

    async _handleTelegramMessageInner(botData, botInstance, msg) {
        let typingInterval;
        let typingActive = false;
        const stopTyping = () => {
            typingActive = false;
            if (typingInterval) {
                clearInterval(typingInterval);
                typingInterval = null;
            }
        };

        try {
            typingActive = true;
            await botInstance.sendChatAction(msg.chat.id, 'typing');
            typingInterval = setInterval(() => {
                if (!typingActive) return;
                botInstance.sendChatAction(msg.chat.id, 'typing').catch(() => { });
            }, 4000);

            const response = await constructorAiService.processMessage(
                botData.id,
                msg.from.id.toString(),
                msg.from.username || msg.from.first_name,
                msg.text
            );

            // Не держим «печатает…» пока грузится фото — иначе Telegram висит после доставки
            stopTyping();

            console.log(`[Telegram] Delivering response to chat ${msg.chat.id}`);
            await deliverTelegramResponse(botInstance, msg.chat.id, response);
            console.log(`[Telegram] Delivered response to chat ${msg.chat.id}`);

            if (typeof response === 'object' && response.document) {
                const fs = require('fs');
                fs.unlink(response.document, (err) => {
                    if (err) console.error('Cleanup failed:', err);
                });
            }
        } catch (err) {
            console.error(`Error in bot ${botData.id}:`, err);
            if (isUncertainTelegramDeliveryError(err)) {
                console.warn(
                    `[Telegram] Skipping user-facing error after uncertain delivery (${msg.chat.id}) — message may already be in chat`
                );
            } else {
                try {
                    await botInstance.sendMessage(msg.chat.id, "Извините, произошла внутренняя ошибка.");
                } catch (sendErr) {
                    console.error('Failed to send error message:', sendErr);
                }
            }
        } finally {
            stopTyping();
        }
    }

    /**
     * Остановка бота
     */
    async stopBot(botId) {
        const botRecord = this.bots.get(botId);
        if (botRecord) {
            try {
                if (botRecord.type === 'telegram' && botRecord.instance) {
                    await botRecord.instance.stopPolling();
                } else if (botRecord.type === 'max') {
                    await maxBotService.deleteWebhook(botRecord.token);
                }
                this.bots.delete(botId);
                console.log(`🛑 Bot ID ${botId} stopped.`);
            } catch (error) {
                console.error(`Error stopping bot ${botId}:`, error);
            }
        }
    }

    /**
     * Перезапуск бота
     */
    async restartBot(botId) {
        const botData = await knex('constructor_bots').where('id', botId).first();
        if (botData && botData.is_active) {
            await this.startBot(botData);
        } else {
            await this.stopBot(botId);
        }
    }

    /**
     * Первый агент проекта: сначала agents.project_id, иначе users.project_id → agent_id.
     */
    async _pickAgentForProject(projectId) {
        let agent = await knex('agents')
            .where('project_id', projectId)
            .orderByRaw('is_active DESC, id ASC')
            .first();
        if (agent) return agent;
        return knex('agents')
            .join('users', 'users.agent_id', 'agents.id')
            .where('users.project_id', projectId)
            .select('agents.*')
            .orderBy('agents.id', 'asc')
            .first();
    }

    /**
     * Любой не-site бот проекта (донор команд CJM).
     */
    async _findDonorConstructorBot(projectId) {
        let row = await knex('constructor_bots')
            .where('project_id', projectId)
            .whereNot('bot_type', 'site')
            .orderBy('created_at', 'desc')
            .first();
        if (row) return row;
        return knex('constructor_bots')
            .join('agents', 'constructor_bots.agent_id', 'agents.id')
            .where('agents.project_id', projectId)
            .whereNot('constructor_bots.bot_type', 'site')
            .select('constructor_bots.*')
            .orderBy('constructor_bots.created_at', 'desc')
            .first();
    }

    async _copyConstructorCommands(fromBotId, toBotId, projectId) {
        const cmds = await knex('constructor_commands').where('bot_id', fromBotId);
        if (!cmds.length) return;
        for (const c of cmds) {
            const { id, created_at, updated_at, ...rest } = c;
            await knex('constructor_commands').insert({
                ...rest,
                bot_id: toBotId,
                project_id: projectId,
            });
        }
    }

    /**
     * Для публичного чата на сайте: если в проекте нет ни одного constructor_bot,
     * создаём строку bot_type=site (токен-заглушка, polling не стартует).
     * Команды копируем с первого телеграм/max-бота проекта, если есть.
     */
    async ensureSiteChatBot(projectId) {
        const agent = await this._pickAgentForProject(projectId);
        if (!agent) return null;

        let bot = await knex('constructor_bots')
            .where({ agent_id: agent.id, bot_type: 'site', project_id: projectId })
            .first();
        if (!bot) {
            bot = await knex('constructor_bots')
                .where({ agent_id: agent.id, bot_type: 'site' })
                .whereNull('project_id')
                .first();
        }

        if (bot) {
            if (Number(bot.project_id) !== Number(projectId)) {
                await knex('constructor_bots').where('id', bot.id).update({
                    project_id: projectId,
                    updated_at: knex.fn.now(),
                });
                bot.project_id = projectId;
            }
            return bot;
        }

        const donor = await this._findDonorConstructorBot(projectId);
        const insertRow = {
            agent_id: agent.id,
            project_id: projectId,
            name: 'Site chat',
            token: `site:${crypto.randomUUID()}`,
            bot_type: 'site',
            is_active: true,
        };

        let newId;
        try {
            [newId] = await knex('constructor_bots').insert(insertRow);
        } catch (e) {
            const dup = e.code === 'ER_DUP_ENTRY' || String(e.message || '').includes('Duplicate');
            if (dup) {
                bot = await knex('constructor_bots')
                    .where({ agent_id: agent.id, project_id: projectId, bot_type: 'site' })
                    .first();
                if (bot) return bot;
            }
            console.error('[ensureSiteChatBot] insert failed:', e.message);
            throw e;
        }

        const resolvedId = typeof newId === 'object' && newId != null ? newId.id : newId;
        if (donor && Number(donor.id) !== Number(resolvedId)) {
            try {
                await this._copyConstructorCommands(donor.id, resolvedId, projectId);
            } catch (copyErr) {
                console.error('[ensureSiteChatBot] command copy failed:', copyErr.message);
            }
        }

        console.log(`[ensureSiteChatBot] created site bot id=${resolvedId} for project_id=${projectId}`);
        return knex('constructor_bots').where('id', resolvedId).first();
    }

    /**
     * Отправка ручного сообщения конкретному клиенту
     */
    async sendMessageToClient(botId, userId, content) {
        const botRecord = this.bots.get(botId) || await knex('constructor_bots').where('id', botId).first();
        if (!botRecord) throw new Error(`Bot ${botId} not found`);

        const botType = botRecord.type || botRecord.bot_type || 'telegram';
        const token = botRecord.token;

        const { text, document, photo, video, media } = content;

        if (botType === 'telegram') {
            const instance = botRecord.instance || new TelegramBot(token, {
                request: telegramProxyRequestOptions(),
            });
            const mergedMedia = Array.isArray(media) && media.length
                ? media
                : [
                    ...(photo ? [{ type: 'image', url: photo, sort: 0 }] : []),
                    ...(video ? [{ type: 'video', url: video, sort: photo ? 1 : 0 }] : []),
                ];

            if (document || mergedMedia.length) {
                await deliverTelegramResponse(instance, userId, {
                    text,
                    document,
                    media: mergedMedia,
                    plain: false,
                });
                return { message_id: null };
            }
            return await instance.sendMessage(userId, text, { parse_mode: 'Markdown' });
        } else if (botType === 'max') {
            if (document) return await maxBotService.sendDocument(token, userId, document, text);
            return await maxBotService.sendMessage(token, userId, text);
        }
    }

    /**
     * Рассылка сообщения всем клиентам бота
     */
    async broadcastMessage(botId, content) {
        const clients = await knex('constructor_clients').where('bot_id', botId);
        const results = { success: 0, failed: 0 };

        for (const client of clients) {
            try {
                await this.sendMessageToClient(botId, client.user_id, content);
                results.success++;
            } catch (error) {
                console.error(`Broadcast failed for client ${client.user_id}:`, error.message);
                results.failed++;
            }
        }
        return results;
    }
}

module.exports = new ConstructorBotService();
