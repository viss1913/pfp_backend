const knex = require('knex')(require('../../knexfile').development);
const constructorBotService = require('../services/constructorBotService');

class ConstructorController {
    // --- Agent Methods ---

    /**
     * POST /pfp/constructor/bot
     * Регистрация или обновление бота агента
     */
    async registerBot(req, res) {
        const agentId = req.user.id; // Из authMiddleware
        const { name, link, token, communication_style, base_brain_context } = req.body;

        try {
            let bot = await knex('constructor_bots').where('agent_id', agentId).first();

            if (bot) {
                await knex('constructor_bots')
                    .where('id', bot.id)
                    .update({
                        name,
                        link,
                        token,
                        communication_style,
                        base_brain_context,
                        updated_at: knex.fn.now()
                    });
            } else {
                const [id] = await knex('constructor_bots').insert({
                    agent_id: agentId,
                    name,
                    link,
                    token,
                    communication_style,
                    base_brain_context
                });
                bot = { id };
            }

            // Перезапускаем бота с новым токеном/настройками
            await constructorBotService.restartBot(bot.id);

            res.json({ success: true, message: 'Bot registered and started' });
        } catch (error) {
            console.error('registerBot error:', error);
            res.status(500).json({ error: 'Failed to register bot' });
        }
    }

    /**
     * GET /pfp/constructor/bot
     */
    async getMyBot(req, res) {
        const agentId = req.user.id;
        try {
            const bot = await knex('constructor_bots').where('agent_id', agentId).first();
            res.json(bot || {});
        } catch (error) {
            res.status(500).json({ error: 'Failed to get bot' });
        }
    }

    /**
     * GET /pfp/constructor/clients
     */
    async getMyClients(req, res) {
        const agentId = req.user.id;
        try {
            const bot = await knex('constructor_bots').where('agent_id', agentId).first();
            if (!bot) return res.json([]);

            const clients = await knex('constructor_clients')
                .where('bot_id', bot.id)
                .orderBy('updated_at', 'desc');

            res.json(clients);
        } catch (error) {
            res.status(500).json({ error: 'Failed to get clients' });
        }
    }

    /**
     * GET /pfp/constructor/messages/:clientId
     */
    async getMessages(req, res) {
        const agentId = req.user.id;
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
        const agentId = req.user.id;
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
        const agentId = req.user.id;
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
        // Здесь должна быть проверка на админа
        try {
            const bots = await knex('constructor_bots')
                .leftJoin('agents', 'constructor_bots.agent_id', 'agents.id')
                .select('constructor_bots.*', 'agents.email as agent_email');
            res.json(bots);
        } catch (error) {
            res.status(500).json({ error: 'Failed to get bots' });
        }
    }

    /**
     * POST /admin/constructor/templates
     */
    async createTemplate(req, res) {
        const { command, classifier, response, section } = req.body;
        try {
            await knex('constructor_commands').insert({
                command,
                classifier,
                response,
                section,
                is_template: true
            });
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: 'Failed to create template' });
        }
    }

    /**
     * GET /admin/constructor/templates
     */
    async getTemplates(req, res) {
        try {
            const templates = await knex('constructor_commands').where('is_template', true);
            res.json(templates);
        } catch (error) {
            res.status(500).json({ error: 'Failed to get templates' });
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
}

module.exports = new ConstructorController();
