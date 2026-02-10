const TelegramBot = require('node-telegram-bot-api');
const knex = require('../config/database');
const constructorAiService = require('./constructorAiService');

class ConstructorBotService {
    constructor() {
        this.bots = new Map(); // botId -> { botInstance, token }
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
            const botInstance = new TelegramBot(botData.token, { polling: true });

            botInstance.on('message', async (msg) => {
                console.log(`[Telegram] Received message from ${msg.from.id}: "${msg.text}"`);
                if (!msg.text) {
                    console.log(`[Telegram] Message from ${msg.from.id} ignored (no text).`);
                    return;
                }

                try {
                    console.log(`[Telegram] Processing message for bot ${botData.id}...`);
                    const response = await constructorAiService.processMessage(
                        botData.id,
                        msg.from.id.toString(),
                        msg.from.username || msg.from.first_name,
                        msg.text
                    );

                    if (typeof response === 'object' && response.document) {
                        console.log(`[Telegram] Sending text and document to ${msg.from.id}`);
                        await botInstance.sendMessage(msg.chat.id, response.text, { parse_mode: 'Markdown' });
                        await botInstance.sendDocument(msg.chat.id, response.document);

                        // Удаляем временный файл после отправки
                        const fs = require('fs');
                        fs.unlink(response.document, (err) => {
                            if (err) console.error('Cleanup failed:', err);
                        });
                    } else {
                        console.log(`[Telegram] Sending response to ${msg.from.id}: "${response.substring(0, 50)}..."`);
                        await botInstance.sendMessage(msg.chat.id, response, { parse_mode: 'Markdown' });
                    }
                } catch (err) {
                    console.error(`Error in bot ${botData.id}:`, err);
                    try {
                        await botInstance.sendMessage(msg.chat.id, "Извините, произошла внутренняя ошибка. Мы уже работаем над исправлением.");
                    } catch (sendErr) {
                        console.error('Failed to send error message to user:', sendErr);
                    }
                }
            });

            botInstance.on('polling_error', (error) => {
                console.error(`Polling error for bot ${botData.id}:`, error.code);
                // Если токен невалиден, можно выключить бота в БД
                if (error.code === 'EFATAL' || error.message.includes('401')) {
                    this.stopBot(botData.id);
                    knex('constructor_bots').where('id', botData.id).update({ is_active: false }).catch(console.error);
                }
            });

            this.bots.set(botData.id, { botInstance, token: botData.token });
            console.log(`🚀 Bot "${botData.name}" (ID: ${botData.id}) started.`);
        } catch (error) {
            console.error(`❌ Failed to start bot ${botData.id}:`, error.message);
        }
    }

    /**
     * Остановка бота
     */
    async stopBot(botId) {
        const botRecord = this.bots.get(botId);
        if (botRecord) {
            try {
                await botRecord.botInstance.stopPolling();
                this.bots.delete(botId);
                console.log(`🛑 Bot ID ${botId} stopped.`);
            } catch (error) {
                console.error(`Error stopping bot ${botId}:`, error);
            }
        }
    }

    /**
     * Перезапуск бота (при обновлении токена или настроек)
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
    async sendMessageToClient(botId, telegramUserId, content) {
        const botRecord = this.bots.get(botId);
        if (!botRecord) throw new Error(`Bot ${botId} not running`);

        const { text, photo, video, voice, audio, document } = content;

        if (photo) return await botRecord.botInstance.sendPhoto(telegramUserId, photo, { caption: text, parse_mode: 'Markdown' });
        if (video) return await botRecord.botInstance.sendVideo(telegramUserId, video, { caption: text, parse_mode: 'Markdown' });
        if (voice) return await botRecord.botInstance.sendVoice(telegramUserId, voice, { caption: text, parse_mode: 'Markdown' });
        if (audio) return await botRecord.botInstance.sendAudio(telegramUserId, audio, { caption: text, parse_mode: 'Markdown' });
        if (document) return await botRecord.botInstance.sendDocument(telegramUserId, document, { caption: text, parse_mode: 'Markdown' });

        return await botRecord.botInstance.sendMessage(telegramUserId, text, { parse_mode: 'Markdown' });
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
