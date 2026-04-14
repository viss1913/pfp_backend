/**
 * AI B2C Controller
 * 
 * Админка: CRUD для brain_contexts и stage_contexts
 * B2C: chat, stream, history
 */

const knex = require('../config/database');
const aiB2cService = require('../services/aiB2cService');
const { extractTextFromUploadedDocument, formatExtractedDocumentSection } = require('../services/documentTextExtractionService');

class AiB2cController {
    async _getChatAiBrainContextById(id, projectId) {
        return knex('ai_b2c_chat_brain_contexts')
            .where('id', id)
            .modify((queryBuilder) => {
                if (projectId) queryBuilder.andWhere('project_id', projectId);
            })
            .first();
    }

    _mapChatAiDocumentListItem(row) {
        return {
            id: row.id,
            brain_context_id: row.brain_context_id,
            project_id: row.project_id,
            original_filename: row.original_filename,
            mime_type: row.mime_type,
            size_bytes: row.size_bytes,
            text_length: row.text_length,
            is_active: row.is_active,
            created_at: row.created_at,
            updated_at: row.updated_at
        };
    }

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

    // ==================== ADMIN/AGENT: Brain Contexts (chat_AI) ====================

    /** GET /pfp/ai-b2c-chat/brain-contexts — список brain-contexts для chat_AI */
    async getAiB2cChatAiBrainContexts(req, res) {
        try {
            const projectId = req.projectId || req.user?.projectId;
            const query = knex('ai_b2c_chat_brain_contexts');
            if (projectId) query.where('project_id', projectId);
            const contexts = await query.orderBy('priority', 'desc');
            res.json(contexts);
        } catch (error) {
            console.error('[AiB2C] Error getting chat_AI brain contexts:', error);
            res.status(500).json({ error: 'Failed to get chat_AI brain contexts' });
        }
    }

    /** POST /pfp/ai-b2c-chat/brain-contexts — создать brain-context для chat_AI */
    async createAiB2cChatAiBrainContext(req, res) {
        try {
            const { title, content, is_active, priority } = req.body;
            const projectId = req.projectId || req.user?.projectId;
            const uploadedDocument = req.file;

            if (!title) {
                return res.status(400).json({ error: 'title is required' });
            }

            if (!content && !uploadedDocument) {
                return res.status(400).json({ error: 'content or document is required' });
            }

            let finalContent = typeof content === 'string' ? content.trim() : '';
            if (uploadedDocument) {
                let extracted;
                try {
                    extracted = await extractTextFromUploadedDocument(uploadedDocument);
                } catch (parseError) {
                    return res.status(400).json({
                        error: 'Could not extract text from uploaded document',
                        details: parseError.message
                    });
                }
                if (!extracted.text) {
                    return res.status(400).json({ error: 'Could not extract text from uploaded document' });
                }

                const fileSection = formatExtractedDocumentSection(extracted, uploadedDocument.originalname);
                finalContent = [finalContent, fileSection].filter(Boolean).join('\n\n');
            }

            const [id] = await knex('ai_b2c_chat_brain_contexts').insert({
                title,
                content: finalContent,
                is_active: is_active !== undefined ? is_active === true || is_active === 'true' || is_active === 1 || is_active === '1' : true,
                priority: Number.isFinite(Number(priority)) ? Number(priority) : 0,
                project_id: projectId || null
            });

            const created = await knex('ai_b2c_chat_brain_contexts').where('id', id).first();
            res.status(201).json(created);
        } catch (error) {
            console.error('[AiB2C] Error creating chat_AI brain context:', error);
            res.status(500).json({ error: 'Failed to create chat_AI brain context' });
        }
    }

    /** POST /pfp/ai-b2c-chat/brain-contexts/:id/documents — загрузить документ в brain-context chat_AI */
    async uploadAiB2cChatAiBrainContextDocument(req, res) {
        try {
            const { id } = req.params;
            const projectId = req.projectId || req.user?.projectId;
            const uploadedDocument = req.file;

            if (!uploadedDocument) {
                return res.status(400).json({ error: 'document file is required' });
            }

            const brainContext = await this._getChatAiBrainContextById(id, projectId);
            if (!brainContext) {
                return res.status(404).json({ error: 'Chat_AI brain context not found' });
            }

            let extracted;
            try {
                extracted = await extractTextFromUploadedDocument(uploadedDocument);
            } catch (parseError) {
                return res.status(400).json({
                    error: 'Could not extract text from uploaded document',
                    details: parseError.message
                });
            }

            if (!extracted.text) {
                return res.status(400).json({ error: 'Could not extract text from uploaded document' });
            }

            const [docId] = await knex('ai_b2c_chat_brain_context_documents').insert({
                brain_context_id: Number(id),
                project_id: projectId || null,
                original_filename: uploadedDocument.originalname || 'document',
                mime_type: uploadedDocument.mimetype || null,
                size_bytes: uploadedDocument.size || null,
                extracted_text: extracted.text,
                text_length: extracted.text.length,
                is_active: true
            });

            const created = await knex('ai_b2c_chat_brain_context_documents').where('id', docId).first();
            res.status(201).json({
                ...this._mapChatAiDocumentListItem(created),
                parser_type: extracted.parserType,
                extracted_text_preview: extracted.text.slice(0, 500)
            });
        } catch (error) {
            console.error('[AiB2C] Error uploading chat_AI brain context document:', error);
            res.status(500).json({ error: 'Failed to upload chat_AI brain context document' });
        }
    }

    /** GET /pfp/ai-b2c-chat/brain-contexts/:id/documents — список документов brain-context chat_AI */
    async listAiB2cChatAiBrainContextDocuments(req, res) {
        try {
            const { id } = req.params;
            const projectId = req.projectId || req.user?.projectId;
            const includeInactive = req.query?.include_inactive === 'true';

            const brainContext = await this._getChatAiBrainContextById(id, projectId);
            if (!brainContext) {
                return res.status(404).json({ error: 'Chat_AI brain context not found' });
            }

            const query = knex('ai_b2c_chat_brain_context_documents')
                .where('brain_context_id', id)
                .orderBy('created_at', 'desc');

            if (projectId) query.andWhere('project_id', projectId);
            if (!includeInactive) query.andWhere('is_active', true);

            const docs = await query;
            res.json(docs.map((row) => this._mapChatAiDocumentListItem(row)));
        } catch (error) {
            console.error('[AiB2C] Error listing chat_AI brain context documents:', error);
            res.status(500).json({ error: 'Failed to list chat_AI brain context documents' });
        }
    }

    /** GET /pfp/ai-b2c-chat/brain-contexts/:id/documents/:docId — документ + extracted_text */
    async getAiB2cChatAiBrainContextDocument(req, res) {
        try {
            const { id, docId } = req.params;
            const projectId = req.projectId || req.user?.projectId;

            const brainContext = await this._getChatAiBrainContextById(id, projectId);
            if (!brainContext) {
                return res.status(404).json({ error: 'Chat_AI brain context not found' });
            }

            const doc = await knex('ai_b2c_chat_brain_context_documents')
                .where({
                    id: docId,
                    brain_context_id: id
                })
                .modify((queryBuilder) => {
                    if (projectId) queryBuilder.andWhere('project_id', projectId);
                })
                .first();

            if (!doc) {
                return res.status(404).json({ error: 'Document not found' });
            }

            res.json({
                ...this._mapChatAiDocumentListItem(doc),
                extracted_text: doc.extracted_text
            });
        } catch (error) {
            console.error('[AiB2C] Error getting chat_AI brain context document:', error);
            res.status(500).json({ error: 'Failed to get chat_AI brain context document' });
        }
    }

    /** DELETE /pfp/ai-b2c-chat/brain-contexts/:id/documents/:docId — удалить документ */
    async deleteAiB2cChatAiBrainContextDocument(req, res) {
        try {
            const { id, docId } = req.params;
            const projectId = req.projectId || req.user?.projectId;

            const brainContext = await this._getChatAiBrainContextById(id, projectId);
            if (!brainContext) {
                return res.status(404).json({ error: 'Chat_AI brain context not found' });
            }

            const deleted = await knex('ai_b2c_chat_brain_context_documents')
                .where({
                    id: docId,
                    brain_context_id: id
                })
                .modify((queryBuilder) => {
                    if (projectId) queryBuilder.andWhere('project_id', projectId);
                })
                .del();

            if (!deleted) {
                return res.status(404).json({ error: 'Document not found' });
            }

            res.json({ success: true });
        } catch (error) {
            console.error('[AiB2C] Error deleting chat_AI brain context document:', error);
            res.status(500).json({ error: 'Failed to delete chat_AI brain context document' });
        }
    }

    /** PUT /pfp/ai-b2c-chat/brain-contexts/:id — обновить brain-context для chat_AI */
    async updateAiB2cChatAiBrainContext(req, res) {
        try {
            const { id } = req.params;
            const { title, content, is_active, priority } = req.body;

            const existing = await knex('ai_b2c_chat_brain_contexts').where('id', id).first();
            if (!existing) return res.status(404).json({ error: 'Chat_AI brain context not found' });

            await knex('ai_b2c_chat_brain_contexts').where('id', id).update({
                ...(title !== undefined && { title }),
                ...(content !== undefined && { content }),
                ...(is_active !== undefined && { is_active }),
                ...(priority !== undefined && { priority }),
                updated_at: knex.fn.now()
            });

            const updated = await knex('ai_b2c_chat_brain_contexts').where('id', id).first();
            res.json(updated);
        } catch (error) {
            console.error('[AiB2C] Error updating chat_AI brain context:', error);
            res.status(500).json({ error: 'Failed to update chat_AI brain context' });
        }
    }

    /** DELETE /pfp/ai-b2c-chat/brain-contexts/:id — удалить brain-context для chat_AI */
    async deleteAiB2cChatAiBrainContext(req, res) {
        try {
            const { id } = req.params;
            const deleted = await knex('ai_b2c_chat_brain_contexts').where('id', id).delete();
            if (!deleted) return res.status(404).json({ error: 'Chat_AI brain context not found' });
            res.json({ success: true });
        } catch (error) {
            console.error('[AiB2C] Error deleting chat_AI brain context:', error);
            res.status(500).json({ error: 'Failed to delete chat_AI brain context' });
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
            const { stage_key, title, content, command_context_text, is_active, priority } = req.body;
            const projectId = req.projectId || req.user?.projectId;

            if (!stage_key || !title || !content) {
                return res.status(400).json({ error: 'stage_key, title and content are required' });
            }

            const [id] = await knex('ai_b2c_stage_contexts').insert({
                stage_key,
                title,
                content,
                command_context_text: command_context_text || null,
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
            const { stage_key, title, content, command_context_text, is_active, priority } = req.body;

            const existing = await knex('ai_b2c_stage_contexts').where('id', id).first();
            if (!existing) return res.status(404).json({ error: 'Stage context not found' });

            await knex('ai_b2c_stage_contexts').where('id', id).update({
                ...(stage_key !== undefined && { stage_key }),
                ...(title !== undefined && { title }),
                ...(content !== undefined && { content }),
                ...(command_context_text !== undefined && { command_context_text }),
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

    // ==================== ADMIN/AGENT: Stage Contexts (chat_AI) ====================

    /** GET /pfp/ai-b2c-chat/stages — список stage-contexts для chat_AI */
    async getAiB2cChatStages(req, res) {
        try {
            const projectId = req.projectId || req.user?.projectId;
            const query = knex('ai_b2c_chat_stage_contexts');
            if (projectId) query.where('project_id', projectId);
            const stages = await query.orderBy('priority', 'desc');
            res.json(stages);
        } catch (error) {
            console.error('[AiB2C] Error getting chat_AI stages:', error);
            res.status(500).json({ error: 'Failed to get chat_AI stage contexts' });
        }
    }

    /** POST /pfp/ai-b2c-chat/stages — создать stage-context для chat_AI */
    async createAiB2cChatStage(req, res) {
        try {
            const { stage_key, title, content, command_context_text, is_active, priority } = req.body;
            const projectId = req.projectId || req.user?.projectId;

            if (!stage_key || !title || !content) {
                return res.status(400).json({ error: 'stage_key, title and content are required' });
            }

            const [id] = await knex('ai_b2c_chat_stage_contexts').insert({
                stage_key,
                title,
                content,
                command_context_text: command_context_text || null,
                is_active: is_active !== undefined ? is_active : true,
                priority: priority || 0,
                project_id: projectId || null
            });

            const created = await knex('ai_b2c_chat_stage_contexts').where('id', id).first();
            res.status(201).json(created);
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ error: `Stage '${req.body.stage_key}' already exists for this project` });
            }
            console.error('[AiB2C] Error creating chat_AI stage:', error);
            res.status(500).json({ error: 'Failed to create chat_AI stage context' });
        }
    }

    /** PUT /pfp/ai-b2c-chat/stages/:id — обновить stage-context для chat_AI */
    async updateAiB2cChatStage(req, res) {
        try {
            const { id } = req.params;
            const { stage_key, title, content, command_context_text, is_active, priority } = req.body;

            const existing = await knex('ai_b2c_chat_stage_contexts').where('id', id).first();
            if (!existing) return res.status(404).json({ error: 'Chat_AI stage context not found' });

            await knex('ai_b2c_chat_stage_contexts').where('id', id).update({
                ...(stage_key !== undefined && { stage_key }),
                ...(title !== undefined && { title }),
                ...(content !== undefined && { content }),
                ...(command_context_text !== undefined && { command_context_text }),
                ...(is_active !== undefined && { is_active }),
                ...(priority !== undefined && { priority }),
                updated_at: knex.fn.now()
            });

            const updated = await knex('ai_b2c_chat_stage_contexts').where('id', id).first();
            res.json(updated);
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ error: `Stage key '${req.body.stage_key}' already exists` });
            }
            console.error('[AiB2C] Error updating chat_AI stage:', error);
            res.status(500).json({ error: 'Failed to update chat_AI stage context' });
        }
    }

    /** DELETE /pfp/ai-b2c-chat/stages/:id — удалить stage-context для chat_AI */
    async deleteAiB2cChatStage(req, res) {
        try {
            const { id } = req.params;
            const deleted = await knex('ai_b2c_chat_stage_contexts').where('id', id).delete();
            if (!deleted) return res.status(404).json({ error: 'Chat_AI stage context not found' });
            res.json({ success: true });
        } catch (error) {
            console.error('[AiB2C] Error deleting chat_AI stage:', error);
            res.status(500).json({ error: 'Failed to delete chat_AI stage context' });
        }
    }

    // ==================== ADMIN: Assistant Settings (имя, аватар, описание) ====================

    /** GET /admin/ai-b2c/settings — получить настройки ассистента для проекта */
    async getAiB2cSettings(req, res) {
        try {
            const projectId = req.projectId || req.user?.projectId;
            if (!projectId) {
                return res.status(400).json({ error: 'projectId is required' });
            }

            const settings = await knex('ai_b2c_settings')
                .where({ project_id: projectId })
                .first();

            res.json(settings || null);
        } catch (error) {
            console.error('[AiB2C] Error getting settings:', error);
            res.status(500).json({ error: 'Failed to get AI B2C settings' });
        }
    }

    /** PUT /admin/ai-b2c/settings — обновить/создать настройки ассистента для проекта
     *  ВАЖНО: avatar_url теперь полностью контролируется бэкендом через /avatar-upload
     *  и здесь намеренно не читается/не обновляется.
     */
    async upsertAiB2cSettings(req, res) {
        try {
            const projectId = req.projectId || req.user?.projectId;
            if (!projectId) {
                return res.status(400).json({ error: 'projectId is required' });
            }

            const { display_name, tagline, dynamic_context_text, openrouter_model } = req.body;
            if (
                display_name === undefined &&
                tagline === undefined &&
                dynamic_context_text === undefined &&
                openrouter_model === undefined
            ) {
                return res.status(400).json({
                    error: 'Nothing to update. Pass at least one of display_name, tagline, dynamic_context_text, openrouter_model',
                });
            }

            const existing = await knex('ai_b2c_settings')
                .where({ project_id: projectId })
                .first();

            if (!existing) {
                const [id] = await knex('ai_b2c_settings').insert({
                    project_id: projectId,
                    display_name: display_name || 'AI-ассистент',
                    avatar_url: null, // аватар выставляется только через upload
                    tagline: tagline || null,
                    dynamic_context_text: dynamic_context_text || null,
                    openrouter_model: openrouter_model != null && String(openrouter_model).trim() ? String(openrouter_model).trim() : null,
                });

                const created = await knex('ai_b2c_settings').where({ id }).first();
                return res.status(201).json(created);
            }

            await knex('ai_b2c_settings')
                .where({ project_id: projectId })
                .update({
                    ...(display_name !== undefined && { display_name }),
                    ...(tagline !== undefined && { tagline }),
                    ...(dynamic_context_text !== undefined && { dynamic_context_text }),
                    ...(openrouter_model !== undefined && {
                        openrouter_model:
                            openrouter_model != null && String(openrouter_model).trim()
                                ? String(openrouter_model).trim()
                                : null,
                    }),
                    updated_at: knex.fn.now()
                });

            const updated = await knex('ai_b2c_settings')
                .where({ project_id: projectId })
                .first();

            res.json(updated);
        } catch (error) {
            console.error('[AiB2C] Error upserting settings:', error);
            res.status(500).json({ error: 'Failed to save AI B2C settings' });
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

    /** POST /my/ai-b2c/chat/dynamic/stream — Dynamic start + streaming SSE */
    async sendAiB2cDynamicChatStream(req, res) {
        try {
            const clientId = req.user.clientId;
            const projectId = req.user.projectId;
            const { message } = req.body;

            if (!message) {
                return res.status(400).json({ error: 'message is required' });
            }

            // SSE headers
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');

            await aiB2cService.chatDynamicStartStream(clientId, projectId, message, res);
        } catch (error) {
            console.error('[AiB2C] Dynamic stream error:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'AI dynamic stream failed' });
            }
        }
    }

    /** POST /my/ai-b2c/chat_AI/stream — Separate chat_AI flow + streaming SSE */
    async sendAiB2cChatAiStream(req, res) {
        try {
            const clientId = req.user.clientId;
            const projectId = req.user.projectId;
            const { message } = req.body;

            if (!message) {
                return res.status(400).json({ error: 'message is required' });
            }

            // SSE headers
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');

            await aiB2cService.chatAiStream(clientId, projectId, message, res);
        } catch (error) {
            console.error('[AiB2C] chat_AI stream error:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'AI chat_AI stream failed' });
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

    /** GET /my/ai-b2c/settings — Получить настройки ассистента для клиента */
    async getMySettings(req, res) {
        try {
            const projectId = req.user.projectId;
            if (!projectId) {
                return res.status(400).json({ error: 'projectId is required' });
            }

            const settings = await knex('ai_b2c_settings')
                .where({ project_id: projectId })
                .first();

            // Возвращаем только нужные фронту поля
            res.json(settings ? {
                display_name: settings.display_name,
                avatar_url: settings.avatar_url,
                tagline: settings.tagline
            } : null);
        } catch (error) {
            console.error('[AiB2C] Get my settings error:', error);
            res.status(500).json({ error: 'Failed to get AI B2C settings' });
        }
    }
}

module.exports = new AiB2cController();
