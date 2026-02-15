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
            const response = await axios.post(`${this.apiUrl}/messages/send`, {
                recipient: recipientId,
                message: {
                    text: text
                }
            }, {
                headers: {
                    'Authorization': token,
                    'Content-Type': 'application/json'
                }
            });
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
            const form = new FormData();
            form.append('recipient', recipientId);
            form.append('file', fs.createReadStream(filePath));
            if (caption) {
                form.append('caption', caption);
            }

            const response = await axios.post(`${this.apiUrl}/messages/send`, form, {
                headers: {
                    'Authorization': token,
                    ...form.getHeaders()
                }
            });
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
