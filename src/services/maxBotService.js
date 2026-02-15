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
                text: text,
                format: 'markdown' // Поддержка форматирования
            }, {
                params: {
                    chat_id: parseInt(recipientId)
                },
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
     * Отправка действия (например, "печатает")
     * @param {string} action - 'typing_on', 'mark_seen' и т.д.
     */
    async sendChatAction(token, recipientId, action = 'typing_on') {
        try {
            const response = await axios.post(`${this.apiUrl}/chats/${recipientId}/actions`, {
                action: action
            }, {
                headers: {
                    'Authorization': token,
                    'Content-Type': 'application/json'
                }
            });
            return response.data;
        } catch (error) {
            console.error('[MAX API] sendChatAction error:', error.response?.data || error.message);
            // Не кидаем ошибку выше, так как это вспомогательное действие
            return null;
        }
    }

    /**
     * Отправка документа (PDF)
     */
    async sendDocument(token, recipientId, filePath, caption = '') {
        try {
            // Этап 1: Получение URL для загрузки и токена
            console.log(`[MAX API] Getting upload URL for: ${path.basename(filePath)}...`);
            const uploadInitRes = await axios.post(`${this.apiUrl}/uploads`, {}, {
                params: { type: 'file' },
                headers: { 'Authorization': token }
            });

            const { url: uploadUrl, token: fileToken } = uploadInitRes.data;
            if (!uploadUrl || !fileToken) {
                throw new Error('Failed to get upload URL or token from MAX API');
            }

            // Этап 2: Загрузка файла на полученный URL
            const form = new FormData();
            form.append('data', fs.createReadStream(filePath));

            console.log(`[MAX API] Uploading file to ${uploadUrl}...`);
            await axios.post(uploadUrl, form, {
                headers: {
                    'Authorization': token,
                    ...form.getHeaders()
                }
            });

            // Этап 3: Отправка сообщения с вложением
            const response = await axios.post(`${this.apiUrl}/messages`, {
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
                params: {
                    chat_id: parseInt(recipientId)
                },
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
