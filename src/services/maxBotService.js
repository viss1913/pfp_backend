const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

class MaxBotService {
    constructor() {
        this.apiUrl = 'https://platform-api.max.ru';
    }

    /**
     * Отправка сообщения пользователю
     */
    async sendMessage(token, recipientId, text) {
        try {
            const response = await axios.post(`${this.apiUrl}/messages`, {
                chat_id: parseInt(recipientId),
                text: text,
                format: 'markdown' // Поддержка форматирования
            }, {
                headers: {
                    'Authorization': token,
                    'Content-Type': 'application/json'
                }
            });
            console.log(`[MAX API] Message sent to chat ${recipientId}: success`);
            return response.data;
        } catch (error) {
            console.error('[MAX API] sendMessage error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Отправка документа (PDF)
     */
    async sendDocument(token, recipientId, filePath, caption = '') {
        try {
            // Этап 1: Загрузка файла для получения токена
            const form = new FormData();
            // По документации поле называется 'data'
            form.append('data', fs.createReadStream(filePath));

            console.log(`[MAX API] Uploading file: ${path.basename(filePath)}...`);
            const uploadRes = await axios.post(`${this.apiUrl}/uploads?type=file`, form, {
                headers: {
                    'Authorization': token,
                    ...form.getHeaders()
                }
            });

            const fileToken = uploadRes.data.token;
            if (!fileToken) {
                throw new Error('Failed to get file token from MAX API');
            }

            // Этап 2: Отправка сообщения с вложением
            const response = await axios.post(`${this.apiUrl}/messages`, {
                chat_id: parseInt(recipientId),
                text: caption,
                format: 'markdown',
                attachments: [
                    {
                        type: 'file',
                        payload: {
                            token: fileToken
                        }
                    }
                ]
            }, {
                headers: {
                    'Authorization': token,
                    'Content-Type': 'application/json'
                }
            });

            console.log(`[MAX API] Document sent to chat ${recipientId}: success (Token: ${fileToken})`);
            return response.data;
        } catch (error) {
            console.error('[MAX API] sendDocument error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Регистрация вебхука
     */
    async setWebhook(token, url, secret) {
        try {
            const response = await axios.post(`${this.apiUrl}/subscriptions`, {
                url: url,
                update_types: ["message_created", "bot_started"],
                secret: secret
            }, {
                headers: {
                    'Authorization': token,
                    'Content-Type': 'application/json'
                }
            });
            console.log(`[MAX API] Webhook set to ${url} for bot.`);
            return response.data;
        } catch (error) {
            console.error('[MAX API] setWebhook error:', error.response?.data || error.message);
            // Если вебхук уже установлен, это может вернуть ошибку, но это не критично в startBot
            return null;
        }
    }

    /**
     * Удаление вебхука
     */
    async deleteWebhook(token) {
        try {
            await axios.delete(`${this.apiUrl}/subscriptions`, {
                headers: {
                    'Authorization': token
                }
            });
            console.log(`[MAX API] Webhook deleted.`);
        } catch (error) {
            console.error('[MAX API] deleteWebhook error:', error.response?.data || error.message);
        }
    }
}

module.exports = new MaxBotService();
