/**
 * AI B2C Controller
 * 
 * Админка: CRUD для brain_contexts и stage_contexts
 * B2C: chat, stream, history
 */

const knex = require('../config/database');
const aiB2cService = require('../services/aiB2cService');

class AiB2cController {

    // ==================== ADMIN: Brain Contexts ====================

    /** GET /admin/ai-b2c/brain-contexts */
    async getAiB2cBrainContexts(req, res) {
        try {
            const projectId = req.projectId || req.user?.projectId;
            const query = knex('ai_b2c_brain_contexts');
            if (projectId) query.where('project_id', projectId);
            const contexts = await query.orderBy('priority', 'desc');
            res.json(contexts);
        } catch (error) {
            console.error('[AiB2C] Error getting brain contexts:', error);
            res.status(500).json({ error: 'Failed to get brain contexts' });
        }
    }

    /** POST /admin/ai-b2c/brain-contexts */
    async createAiB2cBrainContext(req, res) {
        try {
            const { title, content, is_active, priority } = req.body;
            const projectId = req.projectId || req.user?.projectId;

            if (!title || !content) {
                return res.status(400).json({ error: 'title and content are required' });
            }

            const [id] = await knex('ai_b2c_brain_contexts').insert({
                title,
                content,
                is_active: is_active !== undefined ? is_active : true,
                priority: priority || 0,
                project_id: projectId || null
            });

            const created = await knex('ai_b2c_brain_contexts').where('id', id).first();
            res.status(201).json(created);
        } catch (error) {
            console.error('[AiB2C] Error creating brain context:', error);
            res.status(500).json({ error: 'Failed to create brain context' });
        }
    }

    /** PUT /admin/ai-b2c/brain-contexts/:id */
    async updateAiB2cBrainContext(req, res) {
        try {
            const { id } = req.params;
            const { title, content, is_active, priority } = req.body;

            const existing = await knex('ai_b2c_brain_contexts').where('id', id).first();
            if (!existing) return res.status(404).json({ error: 'Brain context not found' });

            await knex('ai_b2c_brain_contexts').where('id', id).update({
                ...(title !== undefined && { title }),
                ...(content !== undefined && { content }),
                ...(is_active !== undefined && { is_active }),
                ...(priority !== undefined && { priority }),
                updated_at: knex.fn.now()
            });

            const updated = await knex('ai_b2c_brain_contexts').where('id', id).first();
            res.json(updated);
        } catch (error) {
            console.error('[AiB2C] Error updating brain context:', error);
            res.status(500).json({ error: 'Failed to update brain context' });
        }
    }

    /** DELETE /admin/ai-b2c/brain-contexts/:id */
    async deleteAiB2cBrainContext(req, res) {
        try {
            const { id } = req.params;
            const deleted = await knex('ai_b2c_brain_contexts').where('id', id).delete();
            if (!deleted) return res.status(404).json({ error: 'Brain context not found' });
            res.json({ success: true });
        } catch (error) {
            console.error('[AiB2C] Error deleting brain context:', error);
            res.status(500).json({ error: 'Failed to delete brain context' });
        }
    }

    // ==================== ADMIN: Stage Contexts ====================

    /** GET /admin/ai-b2c/stages */
    async getAiB2cStages(req, res) {
        try {
            const projectId = req.projectId || req.user?.projectId;
            const query = knex('ai_b2c_stage_contexts');
            if (projectId) query.where('project_id', projectId);
            const stages = await query.orderBy('priority', 'desc');
            res.json(stages);
        } catch (error) {
            console.error('[AiB2C] Error getting stages:', error);
            res.status(500).json({ error: 'Failed to get stage contexts' });
        }
    }

    /** POST /admin/ai-b2c/stages */
    async createAiB2cStage(req, res) {
        try {
            const { stage_key, title, content, is_active, priority } = req.body;
            const projectId = req.projectId || req.user?.projectId;

            if (!stage_key || !title || !content) {
                return res.status(400).json({ error: 'stage_key, title and content are required' });
            }

            const [id] = await knex('ai_b2c_stage_contexts').insert({
                stage_key,
                title,
                content,
                is_active: is_active !== undefined ? is_active : true,
                priority: priority || 0,
                project_id: projectId || null
            });

            const created = await knex('ai_b2c_stage_contexts').where('id', id).first();
            res.status(201).json(created);
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ error: `Stage '${req.body.stage_key}' already exists for this project` });
            }
            console.error('[AiB2C] Error creating stage:', error);
            res.status(500).json({ error: 'Failed to create stage context' });
        }
    }

    /** PUT /admin/ai-b2c/stages/:id */
    async updateAiB2cStage(req, res) {
        try {
            const { id } = req.params;
            const { stage_key, title, content, is_active, priority } = req.body;

            const existing = await knex('ai_b2c_stage_contexts').where('id', id).first();
            if (!existing) return res.status(404).json({ error: 'Stage context not found' });

            await knex('ai_b2c_stage_contexts').where('id', id).update({
                ...(stage_key !== undefined && { stage_key }),
                ...(title !== undefined && { title }),
                ...(content !== undefined && { content }),
                ...(is_active !== undefined && { is_active }),
                ...(priority !== undefined && { priority }),
                updated_at: knex.fn.now()
            });

            const updated = await knex('ai_b2c_stage_contexts').where('id', id).first();
            res.json(updated);
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ error: `Stage key '${req.body.stage_key}' already exists` });
            }
            console.error('[AiB2C] Error updating stage:', error);
            res.status(500).json({ error: 'Failed to update stage context' });
        }
    }

    /** DELETE /admin/ai-b2c/stages/:id */
    async deleteAiB2cStage(req, res) {
        try {
            const { id } = req.params;
            const deleted = await knex('ai_b2c_stage_contexts').where('id', id).delete();
            if (!deleted) return res.status(404).json({ error: 'Stage context not found' });
            res.json({ success: true });
        } catch (error) {
            console.error('[AiB2C] Error deleting stage:', error);
            res.status(500).json({ error: 'Failed to delete stage context' });
        }
    }

    // ==================== B2C: Chat ====================

    /** POST /my/ai-b2c/chat — Обычный ответ */
    async sendAiB2cChat(req, res) {
        try {
            const clientId = req.user.clientId;
            const projectId = req.user.projectId;
            const { stage, message } = req.body;

            if (!stage || !message) {
                return res.status(400).json({ error: 'stage and message are required' });
            }

            const response = await aiB2cService.chat(clientId, projectId, stage, message);
            res.json({ stage, response });
        } catch (error) {
            console.error('[AiB2C] Chat error:', error);
            res.status(500).json({ error: 'AI chat failed' });
        }
    }

    /** POST /my/ai-b2c/chat/stream — Стриминг SSE */
    async sendAiB2cChatStream(req, res) {
        try {
            const clientId = req.user.clientId;
            const projectId = req.user.projectId;
            const { stage, message } = req.body;

            if (!stage || !message) {
                return res.status(400).json({ error: 'stage and message are required' });
            }

            // SSE headers
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');

            await aiB2cService.chatStream(clientId, projectId, stage, message, res);
        } catch (error) {
            console.error('[AiB2C] Stream error:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'AI stream failed' });
            }
        }
    }

    /** GET /my/ai-b2c/history — Получить историю */
    async getAiB2cHistory(req, res) {
        try {
            const clientId = req.user.clientId;
            const { stage } = req.query;

            const history = await aiB2cService.getHistory(clientId, stage);
            res.json(history);
        } catch (error) {
            console.error('[AiB2C] History error:', error);
            res.status(500).json({ error: 'Failed to get chat history' });
        }
    }

    /** DELETE /my/ai-b2c/history — Очистить историю */
    async clearAiB2cHistory(req, res) {
        try {
            const clientId = req.user.clientId;
            const { stage } = req.query;

            await aiB2cService.clearHistory(clientId, stage);
            res.json({ success: true });
        } catch (error) {
            console.error('[AiB2C] Clear history error:', error);
            res.status(500).json({ error: 'Failed to clear history' });
        }
    }

    /** GET /my/ai-b2c/stages — Получить список доступных этапов (для клиента) */
    async getMyStages(req, res) {
        try {
            const projectId = req.user.projectId;
            const stages = await knex('ai_b2c_stage_contexts')
                .where({ project_id: projectId, is_active: true })
                .orWhere(function () {
                    this.whereNull('project_id').andWhere('is_active', true);
                })
                .select('stage_key', 'title')
                .orderBy('priority', 'desc');

            res.json(stages);
        } catch (error) {
            console.error('[AiB2C] Get my stages error:', error);
            res.status(500).json({ error: 'Failed to get available stages' });
        }
    }
}

module.exports = new AiB2cController();
