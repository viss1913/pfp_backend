const TelegramBot = require('node-telegram-bot-api');
const knex = require('../config/database');
const constructorAiService = require('./constructorAiService');
const maxBotService = require('./maxBotService');

class ConstructorBotService {
    constructor() {
        this.bots = new Map(); // botId -> { instance, token, type, secret }
    }

    /**
     * Инициализация всех активных ботов при старте сервера
     */
    async initAllBots() {
        console.log('🤖 Initializing AI Constructor Bots...');
        try {
            const activeBots = await knex('constructor_bots').where('is_active', true);
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
                const botInstance = new TelegramBot(botData.token, { polling: true });

                botInstance.on('message', async (msg) => {
                    await this.handleTelegramMessage(botData, botInstance, msg);
                });

                botInstance.on('polling_error', (error) => {
                    console.error(`Polling error for bot ${botData.id}:`, error.code);
                    if (error.code === 'EFATAL' || error.message.includes('401')) {
                        this.stopBot(botData.id);
                        knex('constructor_bots').where('id', botData.id).update({ is_active: false }).catch(console.error);
                    }
                });

                this.bots.set(botData.id, { instance: botInstance, token: botData.token, type: 'telegram' });
                console.log(`🚀 Telegram Bot "${botData.name}" (ID: ${botData.id}) started.`);
            } else if (botData.bot_type === 'max') {
                // --- MAX ---
                // Для MAX мы просто регистрируем вебхук. Сами сообщения придут в контроллер.
                // Генерируем секрет для вебхука, если его нет (можно использовать id бота или токен)
                const secret = botData.webhook_secret || `max-secret-${botData.id}`;

                // ВАЖНО: URL должен быть публично доступным.
                // В реальном приложении это будет https://domain.com/api/constructor/webhook/max/BOT_ID
                const webhookUrl = process.env.BASE_URL
                    ? `${process.env.BASE_URL}/api/constructor/webhook/max/${botData.id}`
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
     * Обработка сообщения из Telegram
     */
    async handleTelegramMessage(botData, botInstance, msg) {
        console.log(`[Telegram] Received message from ${msg.from.id}: "${msg.text}"`);
        if (!msg.text) return;

        try {
            const response = await constructorAiService.processMessage(
                botData.id,
                msg.from.id.toString(),
                msg.from.username || msg.from.first_name,
                msg.text
            );

            if (typeof response === 'object' && response.document) {
                await botInstance.sendMessage(msg.chat.id, response.text, { parse_mode: 'Markdown' });
                await botInstance.sendDocument(msg.chat.id, response.document);

                const fs = require('fs');
                fs.unlink(response.document, (err) => {
                    if (err) console.error('Cleanup failed:', err);
                });
            } else {
                await botInstance.sendMessage(msg.chat.id, response, { parse_mode: 'Markdown' });
            }
        } catch (err) {
            console.error(`Error in bot ${botData.id}:`, err);
            try {
                await botInstance.sendMessage(msg.chat.id, "Извините, произошла внутренняя ошибка.");
            } catch (sendErr) {
                console.error('Failed to send error message:', sendErr);
            }
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
     * Отправка ручного сообщения конкретному клиенту
     */
    async sendMessageToClient(botId, userId, content) {
        const botRecord = this.bots.get(botId) || await knex('constructor_bots').where('id', botId).first();
        if (!botRecord) throw new Error(`Bot ${botId} not found`);

        const botType = botRecord.type || botRecord.bot_type || 'telegram';
        const token = botRecord.token;

        const { text, document } = content;

        if (botType === 'telegram') {
            const instance = botRecord.instance || new TelegramBot(token);
            if (document) return await instance.sendDocument(userId, document, { caption: text, parse_mode: 'Markdown' });
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
