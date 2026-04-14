/**
 * AI B2C Service
 * 
 * Полностью независимая система ИИ-ассистента для B2C фронта.
 * Собирает промпт из 4 слоёв:
 *   1. Главный Мозг (ai_b2c_brain_contexts)
 *   2. Контекст этапа (ai_b2c_stage_contexts)
 *   3. Данные клиента (финплан, цели, активы)
 *   4. История чата (ai_b2c_chat_messages)
 */

const knex = require('../config/database');
const aiService = require('./aiService');
const { buildChatContext, formatChatContextForPrompt } = require('./chatContextService');
const { formatExtractedDocumentSection } = require('./documentTextExtractionService');

const DOC_SNIPPET_LIMIT_CHARS = 4000;
const DOC_TOTAL_LIMIT_CHARS = 30000;
const CONTEXT_ARCHITECT_MAX_CHARS = 12000;
const DOC_CHUNK_SIZE = 1200;
const DOC_CHUNK_OVERLAP = 200;

class AiB2cService {
    _isDocDebugEnabled() {
        return String(process.env.AI_B2C_DOC_DEBUG || '').toLowerCase() === 'true';
    }

    _debugLog(message, payload = null) {
        if (!this._isDocDebugEnabled()) return;
        if (payload == null) {
            console.log(`[AiB2C DOC DEBUG] ${message}`);
            return;
        }
        try {
            console.log(`[AiB2C DOC DEBUG] ${message}: ${JSON.stringify(payload)}`);
        } catch (_) {
            console.log(`[AiB2C DOC DEBUG] ${message}`);
        }
    }

    /**
     * Отправить сообщение ИИ (non-streaming)
     */
    async chat(clientId, projectId, stageKey, userMessage) {
        // Собираем промпт
        const prompt = await this._buildPrompt(clientId, projectId, stageKey, userMessage);

        // Получаем ответ от ИИ
        const responseText = await aiService.getCompletion(prompt);

        // Сохраняем оба сообщения в историю
        await this._saveMessages(clientId, stageKey, userMessage, responseText);

        return responseText;
    }

    /**
     * Отправить сообщение ИИ (streaming SSE)
     */
    async chatStream(clientId, projectId, stageKey, userMessage, res) {
        // Собираем промпт
        const prompt = await this._buildPrompt(clientId, projectId, stageKey, userMessage);

        // Стримим ответ
        const fullText = await aiService.streamCompletion(prompt, null, res);

        // Сохраняем оба сообщения в историю
        await this._saveMessages(clientId, stageKey, userMessage, fullText);

        return fullText;
    }

    /**
     * Dynamic B2C chat flow (2 шага):
     * - 1-е сообщение: сразу отвечаем на стадии "start" (1-й ИИ не вызываем)
     * - следующие сообщения: 1-й ИИ выбирает команду маршрутизации => stageKey, 2-й ИИ генерит ответ на выбранной стадии
     */
    async chatDynamicStartStream(clientId, projectId, userMessage, res) {
        const assistantName = await this._getAssistantDisplayName(projectId);

        // По твоей логике: если это первое сообщение в сессии/истории — пропускаем классификатор.
        const hasAnyHistory = await this._hasAnyChatHistory(clientId);
        if (!hasAnyHistory) {
            const stageKey = 'start';
            const prompt = await this._buildPrompt(clientId, projectId, stageKey, userMessage, {
                historyMode: 'global',
                assistantName
            });

            const fullText = await aiService.streamCompletion(prompt, null, res);
            await this._saveMessagesWithStageKeys(clientId, stageKey, stageKey, userMessage, fullText);
            return fullText;
        }

        // Текущая стадия для классификатора = stage_key последнего assistant-сообщения.
        const currentStageKey = await this._getLastAssistantStageKey(clientId) || 'start';
        const historyGlobal = await this._getChatHistoryGlobal(clientId);
        const currentStageContext = await this._getStageContext(projectId, currentStageKey);

        // 1-й ИИ: маршрутизация (команда) для следующей стадии.
        const routingCommand = await this._classifyDynamicCommand(projectId, userMessage, {
            historyMessages: historyGlobal,
            currentStageKey,
            commandContextText: currentStageContext?.command_context_text || null
        });

        // Маппинг команды -> stage_key для 2-го ИИ.
        const nextStageKey = this._commandToStageKey(routingCommand) || 'start';

        // 2-й ИИ: ответ на выбранной стадии, но с глобальной историей диалога.
        const prompt = await this._buildPrompt(clientId, projectId, nextStageKey, userMessage, {
            historyMode: 'global',
            assistantName
        });

        const fullText = await aiService.streamCompletion(prompt, null, res);
        await this._saveMessagesWithStageKeys(clientId, currentStageKey, nextStageKey, userMessage, fullText);
        return fullText;
    }

    /**
     * Chat_AI flow (2 шага) с отдельными наборами контекстов и историей
     * (чтобы не ломать уже настроенный site-flow).
     *
     * Endpoint:
     *  POST /my/ai-b2c/chat_AI/stream
     */
    async chatAiStream(clientId, projectId, userMessage, res) {
        const assistantName = await this._getAssistantDisplayName(projectId);

        // 1-е сообщение в chat_AI-истории => пропускаем 1-й ИИ, отвечаем на stageKey="start"
        const hasAnyHistory = await this._hasAnyChatAiHistory(clientId);
        if (!hasAnyHistory) {
            const stageKey = 'start';
            const prompt = await this._buildChatAiPrompt(clientId, projectId, stageKey, userMessage, {
                historyMode: 'global',
                assistantName
            });

            const fullText = await aiService.streamCompletion(prompt, null, res);
            await this._saveChatAiMessagesWithStageKeys(clientId, stageKey, stageKey, userMessage, fullText);
            return fullText;
        }

        const currentStageKey = await this._getLastChatAiAssistantStageKey(clientId) || 'start';
        const historyGlobal = await this._getChatAiHistoryGlobal(clientId);
        const currentStageContext = await this._getChatAiStageContext(projectId, currentStageKey);

        // 1-й ИИ => команда маршрутизации для следующей стадии
        const routingCommand = await this._classifyDynamicCommand(projectId, userMessage, {
            historyMessages: historyGlobal,
            currentStageKey,
            commandContextText: currentStageContext?.command_context_text || null
        });

        const nextStageKey = this._commandToStageKey(routingCommand) || 'start';

        // 2-й ИИ => финальный ответ на выбранной стадии, учитывая глобальную историю chat_AI
        const prompt = await this._buildChatAiPrompt(clientId, projectId, nextStageKey, userMessage, {
            historyMode: 'global',
            assistantName
        });

        const fullText = await aiService.streamCompletion(prompt, null, res);
        await this._saveChatAiMessagesWithStageKeys(clientId, currentStageKey, nextStageKey, userMessage, fullText);
        return fullText;
    }

    /**
     * Получить историю чата клиента по этапу
     */
    async getHistory(clientId, stageKey) {
        const query = knex('ai_b2c_chat_messages')
            .where('client_id', clientId)
            .orderBy('created_at', 'asc');

        if (stageKey) {
            query.where('stage_key', stageKey);
        }

        return query.select('id', 'stage_key', 'role', 'content', 'created_at');
    }

    /**
     * Очистить историю чата (опционально по этапу)
     */
    async clearHistory(clientId, stageKey) {
        const query = knex('ai_b2c_chat_messages').where('client_id', clientId);
        if (stageKey) {
            query.where('stage_key', stageKey);
        }
        return query.delete();
    }

    // ==================== PRIVATE ====================

    /**
     * Собрать промпт из 4 слоёв
     */
    async _buildPrompt(clientId, projectId, stageKey, userMessage, options = {}) {
        const historyMode = options.historyMode || 'stage';
        const assistantNameSection = options.assistantName
            ? `ИМЯ АССИСТЕНТА: ${options.assistantName}\n`
            : '';

        // Параллельно загружаем все данные
        const [brainContexts, stageContext, clientData, history] = await Promise.all([
            this._getBrainContexts(projectId),
            this._getStageContext(projectId, stageKey),
            this._getClientData(clientId),
            historyMode === 'global'
                ? this._getChatHistoryGlobal(clientId)
                : this._getChatHistory(clientId, stageKey),
        ]);

        // Слой 1: Главный Мозг
        const brainSection = brainContexts
            .map(ctx => `--- ${ctx.title}\n${ctx.content}`)
            .join('\n\n');

        const dynamicBrainSection = await this._buildDynamicChatAiMainContext({
            projectId,
            userMessage,
            history,
            brainSection
        });

        // Слой 2: Контекст этапа
        const stageSection = stageContext
            ? `КОНТЕКСТ ТЕКУЩЕГО ЭТАПА "${stageContext.title}" (stage: ${stageKey}):\n${stageContext.content}`
            : `Этап: ${stageKey} (контекст не настроен)`;

        const routingSection = options.routingCommand
            ? `\n\nСЛУЖЕБНАЯ КОМАНДА МАРШРУТИЗАЦИИ (НЕ ОЗВУЧИВАТЬ ПОЛЬЗОВАТЕЛЮ): ${options.routingCommand}`
            : '';

        // Слой 3: Данные клиента
        const clientSection = this._formatClientData(clientData);

        // Слой 4: История
        const historyMessages = history.map(msg => ({
            role: msg.role,
            content: msg.content
        }));

        // Собираем финальный промпт
        const systemPrompt = `
Ты — ИИ-ассистент по финансовому планированию.
СЕГОДНЯШНЯЯ ДАТА: ${new Date().toISOString().split('T')[0]}

${assistantNameSection}
СЛОЙ 1 (ГЛАВНЫЙ МОЗГ — БАЗОВЫЕ ЗНАНИЯ И ИНСТРУКЦИИ):
${dynamicBrainSection || brainSection || 'Ты — опытный финансовый консультант. Помогай клиенту с финансовым планированием.'}

СЛОЙ 2 (КОНТЕКСТ ТЕКУЩЕГО ЭТАПА):
${stageSection}${routingSection}

СЛОЙ 3 (ДАННЫЕ О КЛИЕНТЕ):
${clientSection}

ВАЖНЫЕ ПРАВИЛА:
1. СЛОЙ 2 (ЭТАП) имеет НАИВЫСШИЙ ПРИОРИТЕТ — выполняй именно то, что там написано.
2. Используй данные клиента (Слой 3) для персонализации ответов.
3. Отвечай кратко, по делу, на русском языке.
4. Используй Markdown для оформления.
5. Не выходи за рамки текущего этапа.
`.trim();

        return [
            { role: 'system', content: systemPrompt },
            ...historyMessages,
            { role: 'user', content: userMessage }
        ];
    }

    /**
     * Собрать промпт для chat_AI (отдельные brain/stage контексты + отдельная история).
     */
    async _buildChatAiPrompt(clientId, projectId, stageKey, userMessage, options = {}) {
        const historyMode = options.historyMode || 'stage';
        const assistantNameSection = options.assistantName
            ? `ИМЯ АССИСТЕНТА: ${options.assistantName}\n`
            : '';

        const [brainContexts, stageContext, clientData, history] = await Promise.all([
            this._getChatAiBrainContexts(projectId, userMessage),
            this._getChatAiStageContext(projectId, stageKey),
            this._getClientData(clientId),
            historyMode === 'global'
                ? this._getChatAiHistoryGlobal(clientId)
                : this._getChatAiHistory(clientId, stageKey)
        ]);

        const brainSection = brainContexts
            .map(ctx => `--- ${ctx.title}\n${ctx.content}`)
            .join('\n\n');

        const dynamicBrainSection = await this._buildDynamicChatAiMainContext({
            projectId,
            userMessage,
            history,
            brainSection
        });

        const stageSection = stageContext
            ? `КОНТЕКСТ ТЕКУЩЕГО ЭТАПА "${stageContext.title}" (stage: ${stageKey}):\n${stageContext.content}`
            : `Этап: ${stageKey} (контекст не настроен)`;

        const routingSection = options.routingCommand
            ? `\n\nСЛУЖЕБНАЯ КОМАНДА МАРШРУТИЗАЦИИ (НЕ ОЗВУЧИВАТЬ ПОЛЬЗОВАТЕЛЮ): ${options.routingCommand}`
            : '';

        const chatContext = buildChatContext({
            clientData,
            calcJson: clientData?.client?.goals_summary,
            projectId
        });
        const clientSection = [
            '### CHAT_CONTEXT (ДАННЫЕ ДЛЯ ИИ, НЕ ВЫДУМЫВАТЬ НЕДОСТАЮЩЕЕ):',
            formatChatContextForPrompt(chatContext)
        ].join('\n');

        const historyMessages = history.map(msg => ({
            role: msg.role,
            content: msg.content
        }));

        const systemPrompt = `
Ты — ИИ-ассистент по финансовому планированию.
СЕГОДНЯШНЯЯ ДАТА: ${new Date().toISOString().split('T')[0]}

${assistantNameSection}
СЛОЙ 1 (ГЛАВНЫЙ МОЗГ — БАЗОВЫЕ ЗНАНИЯ И ИНСТРУКЦИИ):
${dynamicBrainSection || brainSection || 'Ты — опытный финансовый консультант. Помогай клиенту с финансовым планированием.'}

СЛОЙ 2 (КОНТЕКСТ ТЕКУЩЕГО ЭТАПА):
${stageSection}${routingSection}

СЛОЙ 3 (ДАННЫЕ О КЛИЕНТЕ):
${clientSection}

ВАЖНЫЕ ПРАВИЛА:
1. СЛОЙ 2 (ЭТАП) имеет высокий приоритет по сценарию и тону ответа.
2. Для фактов из документов/регламентов (адреса, контакты, условия, тарифы, правила) приоритет у фактов из СЛОЯ 1, если есть противоречие со СЛОЕМ 2.
3. Если в СЛОЕ 1 нет подтверждённого факта — честно сообщи, что данных недостаточно.
4. Используй данные клиента (Слой 3) для персонализации ответов.
5. Отвечай кратко, по делу, на русском языке.
6. Используй Markdown для оформления.
7. Не выходи за рамки текущего этапа.
8. Если в поле chat_context.missing_fields есть значения — задай максимум 1–3 вопроса из questions_queue и не додумывай значения сам.
`.trim();

        return [
            { role: 'system', content: systemPrompt },
            ...historyMessages,
            { role: 'user', content: userMessage }
        ];
    }

    async _classifyDynamicCommand(projectId, userMessage, { historyMessages = [], currentStageKey = 'start', commandContextText = null } = {}) {
        const dynamicContextText = commandContextText || await this._getDynamicContextText(projectId);
        const defaultCommand = '/start';

        if (!dynamicContextText) {
            return defaultCommand;
        }

        const foundCommands = dynamicContextText.match(/\/[a-zA-Z0-9_-]+/g) || [];
        const allowedCommands = Array.from(new Set(foundCommands.map(s => String(s).trim()).filter(Boolean)));

        const allowedCommandsText = allowedCommands.length
            ? `ВЫБЕРИ ОДНУ КОМАНДУ ТОЛЬКО ИЗ СПИСКА: ${allowedCommands.join(', ')}`
            : 'ВЫБЕРИ ОДНУ КОМАНДУ: /consulting, /startPFP, /start';

        const classifierPrompt = [
            {
                role: 'system',
                content: [
                    'Ты управляющий динамическим контекстом ИИ.',
                    'Твоя задача писать команды для другого ИИ для перехода на другие стадии.',
                    '',
                    `ТЕКУЩАЯ СТАДИЯ: ${currentStageKey}`,
                    '',
                    'DYNAMIC CONTEXT (правила стадий и маршрутизации):',
                    dynamicContextText,
                    '',
                    allowedCommandsText,
                    'Возвращай строго одну команду (например: /startPFP).',
                    'Никаких пояснений, только команда.'
                ].join('\n')
            },
            ...historyMessages.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: userMessage }
        ];

        const rawResponse = await aiService.getCompletion(classifierPrompt);
        return this._normalizeRoutingCommand(rawResponse, defaultCommand);
    }

    _normalizeRoutingCommand(rawResponse, fallback = '/start') {
        const text = String(rawResponse || '');

        // Берём первое вхождение "/команда" из ответа.
        const match = text.match(/\/[a-zA-Z0-9_-]+/);
        if (match && match[0]) return match[0];

        const lowered = text.toLowerCase();
        if (lowered.includes('consulting')) return '/consulting';
        if (lowered.includes('startpfp')) return '/startPFP';
        if (lowered.includes('start')) return '/start';
        return fallback;
    }

    async _getDynamicContextText(projectId) {
        const settings = await knex('ai_b2c_settings')
            .where({ project_id: projectId })
            .first();
        return settings?.dynamic_context_text || null;
    }

    _safeJsonParse(text) {
        const raw = String(text || '').trim();
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch (_) {
            const match = raw.match(/\{[\s\S]*\}/);
            if (match) {
                try {
                    return JSON.parse(match[0]);
                } catch (_) {
                    return null;
                }
            }
            return null;
        }
    }

    async _getAiB2cProjectModel(projectId) {
        const settings = await knex('ai_b2c_settings')
            .where({ project_id: projectId })
            .first();
        const model = String(settings?.openrouter_model || '').trim();
        return model || null;
    }

    async _buildDynamicChatAiMainContext({ projectId, userMessage, history, brainSection }) {
        const source = String(brainSection || '').trim();
        if (!source) return '';

        const enabled = String(process.env.AI_B2C_CONTEXT_ARCHITECT_ENABLED || 'true').toLowerCase() !== 'false';
        if (!enabled) {
            return source.slice(0, CONTEXT_ARCHITECT_MAX_CHARS);
        }

        const historyTail = (history || [])
            .slice(-8)
            .map((m) => `${m.role === 'assistant' ? 'ASSISTANT' : 'USER'}: ${m.content}`)
            .join('\n');

        const architectPrompt = [
            {
                role: 'system',
                content: [
                    'Ты архитектор контекстов для другого ИИ.',
                    'Твоя задача: из исходного главного контекста выбрать только релевантные факты под текущий вопрос пользователя.',
                    'Верни строго JSON-объект без markdown:',
                    '{"dynamic_main_context":"...", "facts":[{"fact":"...", "source":"..."}], "confidence":"high|medium|low"}',
                    'Правила:',
                    '- Не выдумывай факты, бери только из SOURCE_CONTEXT.',
                    '- Если данных недостаточно, так и напиши в dynamic_main_context.',
                    `- dynamic_main_context должен быть не длиннее ${CONTEXT_ARCHITECT_MAX_CHARS} символов.`,
                    '- Максимум 8 facts.'
                ].join('\n')
            },
            {
                role: 'user',
                content: [
                    `USER_QUESTION:\n${String(userMessage || '').trim()}`,
                    '',
                    `DIALOG_HISTORY:\n${historyTail || 'no history'}`,
                    '',
                    `SOURCE_CONTEXT:\n${source}`
                ].join('\n')
            }
        ];

        try {
            const model = await this._getAiB2cProjectModel(projectId);
            const raw = await aiService.getCompletion(architectPrompt, model);
            const parsed = this._safeJsonParse(raw);
            const dynamic = String(parsed?.dynamic_main_context || '').trim();
            this._debugLog('Context architect output', {
                projectId,
                model: model || 'default',
                sourceLength: source.length,
                outputLength: dynamic.length,
                confidence: parsed?.confidence || null,
                factsCount: Array.isArray(parsed?.facts) ? parsed.facts.length : 0
            });
            if (dynamic) {
                return dynamic.slice(0, CONTEXT_ARCHITECT_MAX_CHARS);
            }
            return source.slice(0, CONTEXT_ARCHITECT_MAX_CHARS);
        } catch (error) {
            console.warn('[AiB2C] Context architect fallback to source context:', error.message);
            return source.slice(0, CONTEXT_ARCHITECT_MAX_CHARS);
        }
    }

    async _getAssistantDisplayName(projectId) {
        const settings = await knex('ai_b2c_settings')
            .where({ project_id: projectId })
            .first();
        return settings?.display_name || 'AI-ассистент';
    }

    async _hasAnyChatHistory(clientId) {
        const row = await knex('ai_b2c_chat_messages')
            .where({ client_id: clientId })
            .first();
        return !!row;
    }

    async _getLastAssistantStageKey(clientId) {
        const last = await knex('ai_b2c_chat_messages')
            .where({ client_id: clientId, role: 'assistant' })
            .orderBy('created_at', 'desc')
            .first();
        return last?.stage_key || null;
    }

    // ==================== chat_AI PRIVATE (отдельные таблицы) ====================

    async _hasAnyChatAiHistory(clientId) {
        const row = await knex('ai_b2c_chat_ai_messages')
            .where({ client_id: clientId })
            .first();
        return !!row;
    }

    async _getLastChatAiAssistantStageKey(clientId) {
        const last = await knex('ai_b2c_chat_ai_messages')
            .where({ client_id: clientId, role: 'assistant' })
            .orderBy('created_at', 'desc')
            .first();
        return last?.stage_key || null;
    }

    async _getChatAiHistoryGlobal(clientId) {
        const rows = await knex('ai_b2c_chat_ai_messages')
            .where({ client_id: clientId })
            .orderBy('created_at', 'desc')
            .limit(20);
        return rows.reverse();
    }

    async _getChatAiHistory(clientId, stageKey) {
        return knex('ai_b2c_chat_ai_messages')
            .where({ client_id: clientId, stage_key: stageKey })
            .orderBy('created_at', 'desc')
            .limit(10)
            .then(rows => rows.reverse());
    }

    async _saveChatAiMessagesWithStageKeys(clientId, userStageKey, assistantStageKey, userMessage, assistantMessage) {
        await knex('ai_b2c_chat_ai_messages').insert([
            { client_id: clientId, stage_key: userStageKey, role: 'user', content: userMessage },
            { client_id: clientId, stage_key: assistantStageKey, role: 'assistant', content: assistantMessage || '' }
        ]);
    }

    /**
     * История chat_AI для одного клиента (хронологический порядок).
     * Таблица: ai_b2c_chat_ai_messages — отдельно от site-flow (ai_b2c_chat_messages).
     */
    async listChatAiDialogForClient(clientId, limitPerClient = 500) {
        const lim = Math.min(Math.max(Number(limitPerClient) || 500, 1), 2000);
        const rows = await knex('ai_b2c_chat_ai_messages')
            .where({ client_id: clientId })
            .orderBy('created_at', 'desc')
            .orderBy('id', 'desc')
            .limit(lim);
        return rows.reverse().map((row) => ({
            id: row.id,
            stage_key: row.stage_key,
            role: row.role,
            content: row.content,
            created_at: row.created_at
        }));
    }

    /**
     * Последние limitPerClient сообщений на каждого client_id (MySQL 8+ ROW_NUMBER).
     * @returns {Map<number, Array<{id, stage_key, role, content, created_at}>>}
     */
    async listChatAiDialogForClients(clientIds, limitPerClient = 200) {
        const map = new Map();
        if (!clientIds || clientIds.length === 0) return map;

        const uniqueIds = [...new Set(clientIds.map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0))];
        if (uniqueIds.length === 0) return map;

        const lim = Math.min(Math.max(Number(limitPerClient) || 200, 1), 500);
        const placeholders = uniqueIds.map(() => '?').join(',');
        const sql = `
            SELECT id, client_id, stage_key, role, content, created_at
            FROM (
                SELECT m.id, m.client_id, m.stage_key, m.role, m.content, m.created_at,
                    ROW_NUMBER() OVER (PARTITION BY m.client_id ORDER BY m.created_at DESC, m.id DESC) AS rn
                FROM ai_b2c_chat_ai_messages m
                WHERE m.client_id IN (${placeholders})
            ) x
            WHERE x.rn <= ?
            ORDER BY x.client_id ASC, x.created_at ASC, x.id ASC
        `;
        const bindings = [...uniqueIds, lim];
        const result = await knex.raw(sql, bindings);
        const rows = result && result[0] ? result[0] : [];

        for (const row of rows) {
            const cid = Number(row.client_id);
            if (!map.has(cid)) map.set(cid, []);
            map.get(cid).push({
                id: row.id,
                stage_key: row.stage_key,
                role: row.role,
                content: row.content,
                created_at: row.created_at
            });
        }
        return map;
    }

    /**
     * История обычного B2C чата (site): `POST .../ai-b2c/chat/stream`, таблица `ai_b2c_chat_messages`.
     * Формат строки тот же, что у chat_AI — чтобы ЛК мог показывать оба канала.
     */
    async listB2cSiteChatDialogForClient(clientId, limitPerClient = 500) {
        const lim = Math.min(Math.max(Number(limitPerClient) || 500, 1), 2000);
        const rows = await knex('ai_b2c_chat_messages')
            .where({ client_id: clientId })
            .orderBy('created_at', 'desc')
            .orderBy('id', 'desc')
            .limit(lim);
        return rows.reverse().map((row) => ({
            id: row.id,
            stage_key: row.stage_key,
            role: row.role,
            content: row.content,
            created_at: row.created_at
        }));
    }

    /**
     * @returns {Map<number, Array<{id, stage_key, role, content, created_at}>>}
     */
    async listB2cSiteChatDialogForClients(clientIds, limitPerClient = 200) {
        const map = new Map();
        if (!clientIds || clientIds.length === 0) return map;

        const uniqueIds = [...new Set(clientIds.map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0))];
        if (uniqueIds.length === 0) return map;

        const lim = Math.min(Math.max(Number(limitPerClient) || 200, 1), 500);
        const placeholders = uniqueIds.map(() => '?').join(',');
        const sql = `
            SELECT id, client_id, stage_key, role, content, created_at
            FROM (
                SELECT m.id, m.client_id, m.stage_key, m.role, m.content, m.created_at,
                    ROW_NUMBER() OVER (PARTITION BY m.client_id ORDER BY m.created_at DESC, m.id DESC) AS rn
                FROM ai_b2c_chat_messages m
                WHERE m.client_id IN (${placeholders})
            ) x
            WHERE x.rn <= ?
            ORDER BY x.client_id ASC, x.created_at ASC, x.id ASC
        `;
        const bindings = [...uniqueIds, lim];
        const result = await knex.raw(sql, bindings);
        const rows = result && result[0] ? result[0] : [];

        for (const row of rows) {
            const cid = Number(row.client_id);
            if (!map.has(cid)) map.set(cid, []);
            map.get(cid).push({
                id: row.id,
                stage_key: row.stage_key,
                role: row.role,
                content: row.content,
                created_at: row.created_at
            });
        }
        return map;
    }

    _extractSearchTerms(text) {
        const stopWords = new Set([
            'что', 'это', 'для', 'как', 'или', 'если', 'где', 'когда', 'какой', 'какая', 'какие',
            'есть', 'нет', 'нужно', 'можно', 'надо', 'про', 'and', 'the', 'with', 'from'
        ]);
        return Array.from(
            new Set(
                String(text || '')
                    .toLowerCase()
                    .replace(/[^a-zа-яё0-9\s-]/gi, ' ')
                    .split(/\s+/)
                    .filter((word) => word.length >= 4 && !stopWords.has(word))
            )
        ).slice(0, 10);
    }

    _buildSearchVariants(term) {
        const t = String(term || '').toLowerCase().trim();
        if (!t) return [];
        const variants = new Set([t]);
        if (t.length >= 6) variants.add(t.slice(0, t.length - 1));
        if (t.length >= 7) variants.add(t.slice(0, t.length - 2));
        if (t.length >= 5) variants.add(t.slice(0, 4));
        return Array.from(variants).filter((v) => v.length >= 3);
    }

    _extractRelevantSnippet(text, searchTerms) {
        const raw = String(text || '');
        if (!raw) return '';
        if (raw.length <= DOC_SNIPPET_LIMIT_CHARS) return raw;

        const expandedTerms = Array.from(
            new Set(
                searchTerms
                    .flatMap((term) => this._buildSearchVariants(term))
                    .concat(['офис', 'адрес', 'тел', 'телефон', 'набереж', 'челн'])
            )
        );

        const chunks = [];
        for (let i = 0; i < raw.length; i += (DOC_CHUNK_SIZE - DOC_CHUNK_OVERLAP)) {
            const piece = raw.slice(i, i + DOC_CHUNK_SIZE);
            if (!piece) continue;
            const lowered = piece.toLowerCase();
            let score = 0;
            for (const term of expandedTerms) {
                if (!term) continue;
                let offset = 0;
                while (true) {
                    const idx = lowered.indexOf(term, offset);
                    if (idx === -1) break;
                    score += 1;
                    offset = idx + term.length;
                }
            }
            if (/[0-9]{6}/.test(piece)) score += 2; // postal-like patterns
            if (/ул\.|улица|д\.|дом|тел|телефон/i.test(piece)) score += 2; // address/contact hints
            chunks.push({ piece, score, index: i });
        }

        chunks.sort((a, b) => b.score - a.score || a.index - b.index);
        const best = chunks.filter((c) => c.score > 0).slice(0, 3);
        if (!best.length) {
            return `${raw.slice(0, DOC_SNIPPET_LIMIT_CHARS)}\n\n[...document snippet truncated...]`;
        }

        const merged = best.map((c, idx) => `[#${idx + 1}]\n${c.piece.trim()}`).join('\n\n...\n\n');
        return merged.slice(0, DOC_SNIPPET_LIMIT_CHARS);
    }

    async _getChatAiBrainContexts(projectId, userMessage = '') {
        let contexts = await knex('ai_b2c_chat_brain_contexts')
            .where({ is_active: true })
            .where(function () {
                this.where('project_id', projectId).orWhereNull('project_id');
            })
            .orderBy('priority', 'desc');

        if (!contexts.length && projectId) {
            contexts = await knex('constructor_brain_contexts')
                .where({ is_active: true, project_id: projectId })
                .orderBy('priority', 'desc');
        }

        if (!contexts.length) return contexts;

        const contextIds = contexts.map((ctx) => ctx.id);
        const docs = await knex('ai_b2c_chat_brain_context_documents')
            .whereIn('brain_context_id', contextIds)
            .where({ is_active: true })
            .orderBy('created_at', 'asc');

        const docsByContext = new Map();
        for (const doc of docs) {
            if (!docsByContext.has(doc.brain_context_id)) {
                docsByContext.set(doc.brain_context_id, []);
            }
            docsByContext.get(doc.brain_context_id).push(doc);
        }

        const searchTerms = this._extractSearchTerms(userMessage);
        let totalDocsChars = 0;
        const selectedDocsDebug = [];

        return contexts.map((ctx) => {
            const ctxDocs = docsByContext.get(ctx.id) || [];
            if (!ctxDocs.length) return ctx;

            const docsSection = ctxDocs
                .map((doc) => {
                    if (totalDocsChars >= DOC_TOTAL_LIMIT_CHARS) return null;
                    const snippet = this._extractRelevantSnippet(doc.extracted_text, searchTerms);
                    const remaining = DOC_TOTAL_LIMIT_CHARS - totalDocsChars;
                    const boundedSnippet = snippet.slice(0, Math.max(0, remaining));
                    totalDocsChars += boundedSnippet.length;
                    selectedDocsDebug.push({
                        contextId: ctx.id,
                        docId: doc.id,
                        filename: doc.original_filename,
                        snippetLength: boundedSnippet.length
                    });
                    return formatExtractedDocumentSection(
                        { text: boundedSnippet, truncated: boundedSnippet.length < String(doc.extracted_text || '').length, parserType: doc.mime_type || 'text' },
                        doc.original_filename
                    );
                })
                .filter(Boolean)
                .join('\n\n');

            this._debugLog('Document selection for prompt', {
                projectId,
                userMessage: String(userMessage || '').slice(0, 200),
                searchTerms,
                selectedDocs: selectedDocsDebug
            });

            return {
                ...ctx,
                content: [ctx.content, docsSection].filter(Boolean).join('\n\n')
            };
        });
    }

    async _getChatAiStageContext(projectId, stageKey) {
        return knex('ai_b2c_chat_stage_contexts')
            .where({ stage_key: stageKey, is_active: true })
            .where(function () {
                this.where('project_id', projectId).orWhereNull('project_id');
            })
            .orderBy('priority', 'desc')
            .first();
    }

    /**
     * Глобальная история: последние 20 сообщений из разных stage_key.
     * Возвращаем их в хронологическом порядке.
     */
    async _getChatHistoryGlobal(clientId) {
        const rows = await knex('ai_b2c_chat_messages')
            .where({ client_id: clientId })
            .orderBy('created_at', 'desc')
            .limit(20);
        return rows.reverse();
    }

    _commandToStageKey(command) {
        const text = String(command || '').trim();
        if (!text) return null;
        const withoutSlash = text.startsWith('/') ? text.slice(1) : text;
        return withoutSlash.trim();
    }

    /**
     * Слой 1: Загрузить brain contexts
     */
    async _getBrainContexts(projectId) {
        return knex('ai_b2c_brain_contexts')
            .where({ is_active: true })
            .where(function () {
                this.where('project_id', projectId).orWhereNull('project_id');
            })
            .orderBy('priority', 'desc');
    }

    /**
     * Слой 2: Загрузить stage context
     */
    async _getStageContext(projectId, stageKey) {
        return knex('ai_b2c_stage_contexts')
            .where({ stage_key: stageKey, is_active: true })
            .where(function () {
                this.where('project_id', projectId).orWhereNull('project_id');
            })
            .orderBy('priority', 'desc')
            .first();
    }

    /**
     * Слой 3: Загрузить данные клиента
     */
    async _getClientData(clientId) {
        const client = await knex('clients').where('id', clientId).first();
        if (!client) return null;

        // Загружаем цели клиента
        const goals = await knex('goals').where('client_id', clientId);

        return { client, goals };
    }

    /**
     * Слой 4: Загрузить историю чата (последние 10)
     */
    async _getChatHistory(clientId, stageKey) {
        return knex('ai_b2c_chat_messages')
            .where({ client_id: clientId, stage_key: stageKey })
            .orderBy('created_at', 'desc')
            .limit(10)
            .then(rows => rows.reverse());
    }

    /**
     * Форматировать данные клиента для промпта
     */
    _formatClientData(data) {
        if (!data || !data.client) return 'Данных о клиенте пока нет.';

        const { client, goals } = data;
        let summary = null;

        if (client.goals_summary) {
            try {
                summary = typeof client.goals_summary === 'string'
                    ? JSON.parse(client.goals_summary)
                    : client.goals_summary;
            } catch (e) { /* ignore */ }
        }

        const sections = [
            this._formatPersonalProfile(client),
            this._formatGoalsList(goals),
            this._formatRecommendations(summary)
        ];

        return sections.filter(s => s.length > 0).join('\n\n');
    }

    _formatPersonalProfile(client) {
        const info = ['### ПРОФИЛЬ КЛИЕНТА:'];
        if (client.first_name || client.last_name) {
            info.push(`- Имя: ${[client.first_name, client.last_name].filter(Boolean).join(' ')}`);
        }
        if (client.age) info.push(`- Возраст: ${client.age}`);
        if (client.monthly_income) info.push(`- Доход: ${client.monthly_income} ₽/мес`);
        if (client.risk_profile) info.push(`- Риск-профиль: ${client.risk_profile}`);
        if (client.updated_at) {
            const lastUpdate = new Date(client.updated_at).toISOString().split('T')[0];
            info.push(`- Дата последнего обновления ПФП: ${lastUpdate}`);
        }
        return info.length > 1 ? info.join('\n') : '';
    }

    _formatGoalsList(goals) {
        if (!goals || goals.length === 0) return '';
        const info = ['### ТЕКУЩИЕ ЦЕЛИ:'];
        goals.forEach((g, i) => {
            const target = g.target_amount ? `${g.target_amount} ₽` : 'сумма не указана';
            info.push(`${i + 1}. ${g.name} (Цель: ${target}, Срок: ${g.term_months || '?'} мес)`);
        });
        return info.join('\n');
    }

    _formatRecommendations(summary) {
        if (!summary || !summary.summary || !summary.summary.consolidated_portfolio) return '';
        const portfolio = summary.summary.consolidated_portfolio;
        const info = ['### РЕКОМЕНДАЦИИ ПО ПОПОЛНЕНИЯМ:'];

        const monthlyTotal = portfolio.total_monthly_replenishment || 0;
        if (monthlyTotal > 0) {
            info.push(`- ОБЩАЯ СУММА ЕЖЕМЕСЯЧНОГО ПОПОЛНЕНИЯ: ${monthlyTotal} ₽`);

            const allocation = portfolio.cash_flow_allocation || [];
            if (allocation.length > 0) {
                info.push('- РАСПРЕДЕЛЕНИЕ ПО АКТИВАМ:');
                allocation.forEach(asset => {
                    info.push(`  * ${asset.name}: ${asset.amount} ₽ (доля ${asset.share}%, дох-ть ${asset.yield}%)`);
                });
            }
        } else {
            info.push('- Ежемесячные пополнения не требуются (план выполняется за счет текущих активов).');
        }

        return info.join('\n');
    }

    /**
     * Сохранить пару сообщений в историю
     */
    async _saveMessages(clientId, stageKey, userMessage, assistantMessage) {
        await knex('ai_b2c_chat_messages').insert([
            { client_id: clientId, stage_key: stageKey, role: 'user', content: userMessage },
            { client_id: clientId, stage_key: stageKey, role: 'assistant', content: assistantMessage || '' }
        ]);
    }

    async _saveMessagesWithStageKeys(clientId, userStageKey, assistantStageKey, userMessage, assistantMessage) {
        await knex('ai_b2c_chat_messages').insert([
            { client_id: clientId, stage_key: userStageKey, role: 'user', content: userMessage },
            { client_id: clientId, stage_key: assistantStageKey, role: 'assistant', content: assistantMessage || '' }
        ]);
    }
}

module.exports = new AiB2cService();
