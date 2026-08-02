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
const agentNetworkService = require('./agentNetworkService');
const { buildPromptVarMap, substitutePromptVars } = require('../utils/aiB2cPromptVars');
const { buildChatContext, formatChatContextForPrompt } = require('./chatContextService');
const { formatExtractedDocumentSection } = require('./documentTextExtractionService');
const {
    runCalcRecalculateFlow,
    buildCalcAiTrailingPayload,
} = require('./calcRecalculateFlowService');

const DOC_SNIPPET_LIMIT_CHARS = 4000;
const DOC_TOTAL_LIMIT_CHARS = 30000;
const CONTEXT_ARCHITECT_MAX_CHARS = 12000;
const DOC_CHUNK_SIZE = 1200;
const DOC_CHUNK_OVERLAP = 200;
const DEFAULT_FLOW_KEY = 'default';

class AiB2cService {
    _normalizeFlowKey(flowKey) {
        const key = String(flowKey || DEFAULT_FLOW_KEY).trim().toLowerCase();
        if (!/^[a-z0-9_-]{1,64}$/.test(key)) return DEFAULT_FLOW_KEY;
        return key;
    }

    _normalizeSessionAgent(agent) {
        if (!agent || typeof agent !== 'object') return null;
        const fullName =
            String(agent.full_name || '').trim() ||
            [agent.first_name, agent.last_name]
                .map((p) => String(p || '').trim())
                .filter(Boolean)
                .join(' ')
                .trim() ||
            String(agent.display_name || '').trim();
        if (!fullName && agent.id == null) return null;
        return {
            id: agent.id,
            first_name: agent.first_name ?? null,
            last_name: agent.last_name ?? null,
            full_name: fullName,
            display_name: String(agent.display_name || '').trim() || fullName,
        };
    }

    _agentRowToSessionAgent(row) {
        if (!row) return null;
        const fullName = [row.first_name, row.last_name]
            .map((p) => String(p || '').trim())
            .filter(Boolean)
            .join(' ')
            .trim();
        if (!fullName) return null;
        return {
            id: row.id,
            first_name: row.first_name || null,
            last_name: row.last_name || null,
            full_name: fullName,
            display_name: fullName,
        };
    }

    /**
     * Resolve referral session: server-side by ref (trusted), client session_context as fallback.
     */
    async _resolveOrchestratorSession(projectId, sessionContext) {
        const ref = String(sessionContext?.ref || '').trim() || null;
        let agent = this._normalizeSessionAgent(sessionContext?.agent);

        if (ref && projectId) {
            try {
                const row = await agentNetworkService.resolveParentAgentFromRef(projectId, ref);
                const resolved = this._agentRowToSessionAgent(row);
                if (resolved) agent = resolved;
            } catch (e) {
                // Invalid ref on server — keep client-supplied agent if any.
            }
        }

        if (!ref && !agent) return null;
        return { ref, agent: agent ?? null };
    }

    _applyPromptVars(text, promptVars) {
        if (!promptVars || text == null || text === '') return text;
        return substitutePromptVars(text, promptVars);
    }

    _buildOrchestratorUserMessage(turn = {}) {
        const parts = [];

        if (turn.session?.agent?.full_name) {
            const refPart = turn.session.ref ? ` (ref: ${turn.session.ref})` : '';
            parts.push(`ПРИГЛАШЕНИЕ:\nАгент, пригласивший клиента: ${turn.session.agent.full_name}${refPart}`);
        } else if (turn.session?.ref) {
            parts.push(`ПРИГЛАШЕНИЕ:\nРеферальная ссылка: ${turn.session.ref}`);
        }

        if (turn.event) parts.push(`СОБЫТИЕ UI: ${turn.event}`);
        if (turn.page) parts.push(`ТЕКУЩАЯ СТРАНИЦА: ${turn.page}`);
        if (turn.goal_type_id != null && turn.goal_type_id !== '') {
            parts.push(`ВЫБРАННАЯ ЦЕЛЬ (goal_type_id): ${turn.goal_type_id}`);
        }
        if (turn.goal_name) parts.push(`НАЗВАНИЕ ЦЕЛИ: ${turn.goal_name}`);
        if (turn.page_data && typeof turn.page_data === 'object') {
            parts.push(`ДАННЫЕ СТРАНИЦЫ:\n${JSON.stringify(turn.page_data, null, 2)}`);
        }
        if (turn.message) parts.push(`СООБЩЕНИЕ КЛИЕНТА:\n${turn.message}`);

        return parts.join('\n\n').trim();
    }
    _isCalcRoutingCommand(command) {
        const k = String(command || '').trim().toLowerCase();
        return k === '/calc' || k === '/recalc' || k === '/recalculate';
    }

    _writeSseFinalText(res, text, pdfUrl = null) {
        if (!res || typeof res.write !== 'function' || res.writableEnded) return;
        if (pdfUrl) {
            res.write(`data: ${JSON.stringify({ type: 'pdf_url', pdf_url: pdfUrl })}\n\n`);
        }
        res.write(`data: ${JSON.stringify({ type: 'text', content: text || '' })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();
    }

    _writeClassifierCommandSse(res, { command, stageKey, classifierSkipped = false } = {}) {
        if (!res || typeof res.write !== 'function' || res.writableEnded) return;
        res.write(
            `data: ${JSON.stringify({
                type: 'classifier_command',
                command: command ?? null,
                stage_key: stageKey ?? null,
                classifierSkipped: !!classifierSkipped,
            })}\n\n`
        );
    }

    _stageKeyCandidates(stageKey) {
        const text = String(stageKey || '').trim();
        if (!text) return [];
        const withSlash = text.startsWith('/') ? text : `/${text}`;
        const withoutSlash = text.startsWith('/') ? text.slice(1) : text;
        return [...new Set([text, withSlash, withoutSlash].filter(Boolean))];
    }

    _normalizeCommandKey(command) {
        const text = String(command || '').trim();
        if (!text) return null;
        return text.startsWith('/') ? text : `/${text}`;
    }

    _commandKeysMatch(a, b) {
        const left = this._normalizeCommandKey(a);
        const right = this._normalizeCommandKey(b);
        if (!left || !right) return false;
        return left.toLowerCase() === right.toLowerCase();
    }

    async _getActiveStageCommands(projectId, flowKey = DEFAULT_FLOW_KEY) {
        const normalizedFlowKey = this._normalizeFlowKey(flowKey);
        const rows = await knex('ai_b2c_stage_contexts')
            .where({ is_active: true, flow_key: normalizedFlowKey })
            .where(function () {
                this.where('project_id', projectId).orWhereNull('project_id');
            })
            .select('stage_key');

        return Array.from(
            new Set(
                rows
                    .map((row) => this._normalizeCommandKey(row.stage_key))
                    .filter(Boolean)
            )
        );
    }

    async _resolveStageContext(projectId, stageKey, { table = 'ai_b2c_stage_contexts', flowKey = DEFAULT_FLOW_KEY } = {}) {
        const candidates = this._stageKeyCandidates(stageKey);
        if (!candidates.length) return null;
        const normalizedFlowKey = this._normalizeFlowKey(flowKey);

        return knex(table)
            .where({ is_active: true, flow_key: normalizedFlowKey })
            .whereIn('stage_key', candidates)
            .where(function () {
                this.where('project_id', projectId).orWhereNull('project_id');
            })
            .orderBy('priority', 'desc')
            .first();
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
    async chatDynamicStartStream(clientId, projectId, turn, res) {
        const flowKey = this._normalizeFlowKey(turn?.flowKey);
        const session = await this._resolveOrchestratorSession(projectId, turn?.sessionContext);
        const assistantName = await this._getAssistantDisplayName(projectId, flowKey);
        const promptVars = buildPromptVarMap({ session, assistantName });
        const userMessage = this._buildOrchestratorUserMessage({ ...turn, session });
        const projectModel = await this._getAiB2cProjectModel(projectId, flowKey);
        const streamOptions = { sseFormat: 'pfp' };
        const allowedStageCommands = await this._getActiveStageCommands(projectId, flowKey);
        const promptOptions = { historyMode: 'global', assistantName, flowKey, promptVars };

        // По твоей логике: если это первое сообщение в сессии/истории — пропускаем классификатор.
        const hasAnyHistory = await this._hasAnyChatHistory(clientId, flowKey);
        if (!hasAnyHistory) {
            const startContext = await this._resolveStageContext(projectId, 'start', { flowKey });
            const nextStageKey = startContext?.stage_key || 'start';
            const routingCommand = this._normalizeCommandKey(startContext?.stage_key) || '/start';

            this._writeClassifierCommandSse(res, {
                command: routingCommand,
                stageKey: nextStageKey,
                classifierSkipped: true,
            });

            const prompt = await this._buildPrompt(clientId, projectId, nextStageKey, userMessage, promptOptions);

            const fullText = await aiService.streamCompletion(prompt, projectModel, res, streamOptions);
            await this._saveMessagesWithStageKeys(clientId, nextStageKey, nextStageKey, userMessage, fullText, flowKey);
            return fullText;
        }

        // Текущая стадия для классификатора = stage_key последнего assistant-сообщения.
        const currentStageKey = await this._getLastAssistantStageKey(clientId, flowKey) || 'start';
        const historyGlobal = await this._getChatHistoryGlobal(clientId, flowKey);
        const currentStageContext = await this._resolveStageContext(projectId, currentStageKey, { flowKey });

        // 1-й ИИ: маршрутизация (команда) для следующей стадии.
        const routingCommand = await this._classifyDynamicCommand(projectId, userMessage, {
            historyMessages: historyGlobal,
            currentStageKey,
            commandContextText: currentStageContext?.command_context_text || null,
            allowedStageCommands,
            flowKey,
            promptVars,
        });

        const nextStageContext = await this._resolveStageContext(projectId, routingCommand, { flowKey });
        const nextStageKey = nextStageContext?.stage_key || this._commandToStageKey(routingCommand) || 'start';

        this._writeClassifierCommandSse(res, {
            command: routingCommand,
            stageKey: nextStageKey,
            classifierSkipped: false,
        });

        // 2-й ИИ: ответ на выбранной стадии, но с глобальной историей диалога.
        const prompt = await this._buildPrompt(clientId, projectId, nextStageKey, userMessage, {
            ...promptOptions,
            routingCommand,
        });

        const fullText = await aiService.streamCompletion(prompt, projectModel, res, streamOptions);
        await this._saveMessagesWithStageKeys(clientId, currentStageKey, nextStageKey, userMessage, fullText, flowKey);
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
        const currentStageContext = await this._resolveStageContext(projectId, currentStageKey, {
            table: 'ai_b2c_chat_stage_contexts',
        });

        // 1-й ИИ => команда маршрутизации для следующей стадии
        const routingCommand = await this._classifyDynamicCommand(projectId, userMessage, {
            historyMessages: historyGlobal,
            currentStageKey,
            commandContextText: currentStageContext?.command_context_text || null
        });

        const nextStageContext = await this._resolveStageContext(projectId, routingCommand, {
            table: 'ai_b2c_chat_stage_contexts',
        });
        const nextStageKey = nextStageContext?.stage_key || this._commandToStageKey(routingCommand) || 'start';
        const isCalcCommand = this._isCalcRoutingCommand(routingCommand) || this._isCalcRoutingCommand(nextStageKey);

        if (isCalcCommand) {
            const historyRows = await this._getChatAiHistoryGlobal(clientId);
            const historyPairs = historyRows
                .slice(-12)
                .map((row) => ({ role: row.role, content: row.content }))
                .reduce((acc, row) => {
                    if (row.role === 'user') {
                        acc.push({ user: row.content || '', assistant: '' });
                    } else if (row.role === 'assistant') {
                        if (acc.length === 0) acc.push({ user: '', assistant: row.content || '' });
                        else acc[acc.length - 1].assistant = row.content || '';
                    }
                    return acc;
                }, []);
            const existingClient = await this._getClientData(clientId);
            const recalc = await runCalcRecalculateFlow({
                pfpClientId: clientId,
                projectId,
                userMessage,
                historyPairs,
                agentId: existingClient?.client?.agent_id || null,
                uploadPdf: true,
            });

            if (recalc.calcInstructionMessage) {
                const text = recalc.pdfUrl
                    ? `${recalc.calcInstructionMessage}\n\n📄 Ваш персональный отчёт (PDF): ${recalc.pdfUrl}`
                    : recalc.calcInstructionMessage;
                this._writeSseFinalText(res, text, recalc.pdfUrl || null);
                await this._saveChatAiMessagesWithStageKeys(clientId, currentStageKey, nextStageKey, userMessage, text);
                return text;
            }

            const prompt = await this._buildChatAiPrompt(clientId, projectId, nextStageKey, userMessage, {
                historyMode: 'global',
                assistantName,
                routingCommand,
                calcPayload: buildCalcAiTrailingPayload(recalc.calculationResult),
            });
            const fullText = await aiService.getCompletion(prompt);
            const finalText = recalc.pdfUrl
                ? `${fullText}\n\n📄 Ваш персональный отчёт (PDF): ${recalc.pdfUrl}`
                : fullText;
            this._writeSseFinalText(res, finalText, recalc.pdfUrl || null);
            await this._saveChatAiMessagesWithStageKeys(clientId, currentStageKey, nextStageKey, userMessage, finalText);
            return finalText;
        }

        // 2-й ИИ => финальный ответ на выбранной стадии, учитывая глобальную историю chat_AI
        const prompt = await this._buildChatAiPrompt(clientId, projectId, nextStageKey, userMessage, {
            historyMode: 'global',
            assistantName,
            routingCommand,
        });

        const fullText = await aiService.streamCompletion(prompt, null, res);
        await this._saveChatAiMessagesWithStageKeys(clientId, currentStageKey, nextStageKey, userMessage, fullText);
        return fullText;
    }

    /**
     * Получить историю чата клиента по этапу
     */
    async getHistory(clientId, stageKey, flowKey = DEFAULT_FLOW_KEY) {
        const normalizedFlowKey = this._normalizeFlowKey(flowKey);
        const query = knex('ai_b2c_chat_messages')
            .where({ client_id: clientId, flow_key: normalizedFlowKey })
            .orderBy('created_at', 'asc');

        if (stageKey) {
            query.where('stage_key', stageKey);
        }

        return query.select('id', 'stage_key', 'role', 'content', 'created_at');
    }

    /**
     * Очистить историю чата (опционально по этапу)
     */
    async clearHistory(clientId, stageKey, flowKey = DEFAULT_FLOW_KEY) {
        const normalizedFlowKey = this._normalizeFlowKey(flowKey);
        const query = knex('ai_b2c_chat_messages').where({ client_id: clientId, flow_key: normalizedFlowKey });
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
        const flowKey = this._normalizeFlowKey(options.flowKey);
        const promptVars = options.promptVars || null;
        const applyVars = (text) => this._applyPromptVars(text, promptVars);
        const assistantNameSection = options.assistantName
            ? `ИМЯ АССИСТЕНТА: ${options.assistantName}\n`
            : '';

        // Параллельно загружаем все данные
        const [brainContexts, stageContext, clientData, history] = await Promise.all([
            this._getBrainContexts(projectId, flowKey),
            this._resolveStageContext(projectId, stageKey, { flowKey }),
            this._getClientData(clientId),
            historyMode === 'global'
                ? this._getChatHistoryGlobal(clientId, flowKey)
                : this._getChatHistory(clientId, stageKey, flowKey),
        ]);

        // Слой 1: Главный Мозг
        const brainSection = brainContexts
            .map(ctx => `--- ${ctx.title}\n${applyVars(ctx.content)}`)
            .join('\n\n');

        const dynamicBrainSection = await this._buildDynamicChatAiMainContext({
            projectId,
            userMessage,
            history,
            brainSection
        });
        const resolvedBrainSection = applyVars(dynamicBrainSection || brainSection);

        // Слой 2: Контекст этапа
        const stageSection = stageContext
            ? `КОНТЕКСТ ТЕКУЩЕГО ЭТАПА "${stageContext.title}" (stage: ${stageKey}):\n${applyVars(stageContext.content)}`
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
${resolvedBrainSection || 'Ты — опытный финансовый консультант. Помогай клиенту с финансовым планированием.'}

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

        const messages = [
            { role: 'system', content: systemPrompt },
            ...historyMessages,
            { role: 'user', content: userMessage }
        ];
        if (options.calcPayload && typeof options.calcPayload === 'object') {
            messages.push({
                role: 'user',
                content:
                    'Служебное сообщение (не показывать пользователю как цитату): расчёт УЖЕ выполнен. Ниже JSON — единственный источник цифр для ответа.\n\nРезультат расчёта (JSON):\n' +
                    JSON.stringify(options.calcPayload, null, 2),
            });
        }
        return messages;
    }

    async _classifyDynamicCommand(
        projectId,
        userMessage,
        {
            historyMessages = [],
            currentStageKey = 'start',
            commandContextText = null,
            allowedStageCommands = null,
            flowKey = DEFAULT_FLOW_KEY,
            promptVars = null,
        } = {}
    ) {
        const normalizedFlowKey = this._normalizeFlowKey(flowKey);
        let dynamicContextText = commandContextText || await this._getDynamicContextText(projectId, normalizedFlowKey);
        dynamicContextText = this._applyPromptVars(dynamicContextText, promptVars);
        const defaultCommand = '/start';
        const stageCommands = Array.isArray(allowedStageCommands) && allowedStageCommands.length
            ? allowedStageCommands
            : await this._getActiveStageCommands(projectId, normalizedFlowKey);

        const foundCommands = String(dynamicContextText || '').match(/\/[a-zA-Z0-9_-]+/g) || [];
        const allowedCommands = Array.from(
            new Set(
                [...stageCommands, ...foundCommands]
                    .map((item) => this._normalizeCommandKey(item))
                    .filter(Boolean)
            )
        );

        if (!dynamicContextText && !allowedCommands.length) {
            return defaultCommand;
        }

        const allowedCommandsText = allowedCommands.length
            ? `ВЫБЕРИ ОДНУ КОМАНДУ ТОЛЬКО ИЗ СПИСКА: ${allowedCommands.join(', ')}`
            : 'ВЫБЕРИ ОДНУ КОМАНДУ: /consulting, /startPFP, /start';

        const classifierPrompt = [
            {
                role: 'system',
                content: [
                    'Ты оркестратор B2C-чата по финансовому планированию.',
                    'Твоя задача — выбрать одну команду перехода на следующую страницу/стадию сценария.',
                    '',
                    `ТЕКУЩАЯ СТАДИЯ: ${currentStageKey}`,
                    '',
                    ...(dynamicContextText
                        ? [
                            'DYNAMIC CONTEXT (правила стадий и маршрутизации):',
                            dynamicContextText,
                            '',
                        ]
                        : []),
                    allowedCommandsText,
                    'Возвращай строго одну команду (например: /vybor_celi2).',
                    'Никаких пояснений, только команда.'
                ].join('\n')
            },
            ...historyMessages.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: userMessage }
        ];

        const projectModel = await this._getAiB2cProjectModel(projectId, normalizedFlowKey);
        const rawResponse = await aiService.getCompletion(classifierPrompt, projectModel);
        return this._normalizeRoutingCommand(rawResponse, allowedCommands, defaultCommand);
    }

    _findAllowedCommand(command, allowedCommands = []) {
        const normalized = this._normalizeCommandKey(command);
        if (!normalized) return null;

        const exact = allowedCommands.find((item) => this._commandKeysMatch(item, normalized));
        if (exact) return this._normalizeCommandKey(exact);

        return null;
    }

    _normalizeRoutingCommand(rawResponse, allowedCommands = [], fallback = '/start') {
        const text = String(rawResponse || '').trim();
        if (!text) return this._findAllowedCommand(fallback, allowedCommands) || this._normalizeCommandKey(fallback);

        const firstLine = text.split('\n').map((line) => line.trim()).find(Boolean);
        const firstLineMatch = this._findAllowedCommand(firstLine, allowedCommands);
        if (firstLineMatch) return firstLineMatch;

        const matches = [...text.matchAll(/\/[a-zA-Z0-9_-]+/g)].map((match) => match[0]);
        for (let i = matches.length - 1; i >= 0; i--) {
            const found = this._findAllowedCommand(matches[i], allowedCommands);
            if (found) return found;
        }

        const lowered = text.toLowerCase();
        for (const command of allowedCommands) {
            const key = this._normalizeCommandKey(command);
            if (!key) continue;
            const plain = key.slice(1).toLowerCase();
            if (lowered.includes(plain)) return key;
        }

        return this._findAllowedCommand(fallback, allowedCommands) || this._normalizeCommandKey(fallback);
    }

    async _getDynamicContextText(projectId, flowKey = DEFAULT_FLOW_KEY) {
        const normalizedFlowKey = this._normalizeFlowKey(flowKey);
        const settings = await knex('ai_b2c_settings')
            .where({ project_id: projectId, flow_key: normalizedFlowKey })
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

    async _getAiB2cProjectModel(projectId, flowKey = DEFAULT_FLOW_KEY) {
        const normalizedFlowKey = this._normalizeFlowKey(flowKey);
        const settings = await knex('ai_b2c_settings')
            .where({ project_id: projectId, flow_key: normalizedFlowKey })
            .first();
        const perProject = String(settings?.openrouter_model || '').trim();
        const { resolveProjectLlmModel } = require('../utils/projectLlmModel');
        return resolveProjectLlmModel(projectId, perProject || null);
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
            if (dynamic) {
                return dynamic.slice(0, CONTEXT_ARCHITECT_MAX_CHARS);
            }
            return source.slice(0, CONTEXT_ARCHITECT_MAX_CHARS);
        } catch (error) {
            console.warn('[AiB2C] Context architect fallback to source context:', error.message);
            return source.slice(0, CONTEXT_ARCHITECT_MAX_CHARS);
        }
    }

    async _getAssistantDisplayName(projectId, flowKey = DEFAULT_FLOW_KEY) {
        const normalizedFlowKey = this._normalizeFlowKey(flowKey);
        const settings = await knex('ai_b2c_settings')
            .where({ project_id: projectId, flow_key: normalizedFlowKey })
            .first();
        return settings?.display_name || 'AI-ассистент';
    }

    async _hasAnyChatHistory(clientId, flowKey = DEFAULT_FLOW_KEY) {
        const normalizedFlowKey = this._normalizeFlowKey(flowKey);
        const row = await knex('ai_b2c_chat_messages')
            .where({ client_id: clientId, flow_key: normalizedFlowKey })
            .first();
        return !!row;
    }

    async _getLastAssistantStageKey(clientId, flowKey = DEFAULT_FLOW_KEY) {
        const normalizedFlowKey = this._normalizeFlowKey(flowKey);
        const last = await knex('ai_b2c_chat_messages')
            .where({ client_id: clientId, role: 'assistant', flow_key: normalizedFlowKey })
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
                    return formatExtractedDocumentSection(
                        { text: boundedSnippet, truncated: boundedSnippet.length < String(doc.extracted_text || '').length, parserType: doc.mime_type || 'text' },
                        doc.original_filename
                    );
                })
                .filter(Boolean)
                .join('\n\n');

            return {
                ...ctx,
                content: [ctx.content, docsSection].filter(Boolean).join('\n\n')
            };
        });
    }

    async _getChatAiStageContext(projectId, stageKey) {
        return this._resolveStageContext(projectId, stageKey, { table: 'ai_b2c_chat_stage_contexts' });
    }

    /**
     * Глобальная история: последние 20 сообщений из разных stage_key.
     * Возвращаем их в хронологическом порядке.
     */
    async _getChatHistoryGlobal(clientId, flowKey = DEFAULT_FLOW_KEY) {
        const normalizedFlowKey = this._normalizeFlowKey(flowKey);
        const rows = await knex('ai_b2c_chat_messages')
            .where({ client_id: clientId, flow_key: normalizedFlowKey })
            .orderBy('created_at', 'desc')
            .limit(20);
        return rows.reverse();
    }

    _commandToStageKey(command) {
        const normalized = this._normalizeCommandKey(command);
        if (!normalized) return null;
        return normalized;
    }

    /**
     * Слой 1: Загрузить brain contexts
     */
    async _getBrainContexts(projectId, flowKey = DEFAULT_FLOW_KEY) {
        const normalizedFlowKey = this._normalizeFlowKey(flowKey);
        return knex('ai_b2c_brain_contexts')
            .where({ is_active: true, flow_key: normalizedFlowKey })
            .where(function () {
                this.where('project_id', projectId).orWhereNull('project_id');
            })
            .orderBy('priority', 'desc');
    }

    /**
     * Слой 2: Загрузить stage context
     */
    async _getStageContext(projectId, stageKey) {
        return this._resolveStageContext(projectId, stageKey);
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
    async _getChatHistory(clientId, stageKey, flowKey = DEFAULT_FLOW_KEY) {
        const normalizedFlowKey = this._normalizeFlowKey(flowKey);
        return knex('ai_b2c_chat_messages')
            .where({ client_id: clientId, stage_key: stageKey, flow_key: normalizedFlowKey })
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
    async _saveMessages(clientId, stageKey, userMessage, assistantMessage, flowKey = DEFAULT_FLOW_KEY) {
        const normalizedFlowKey = this._normalizeFlowKey(flowKey);
        await knex('ai_b2c_chat_messages').insert([
            { client_id: clientId, stage_key: stageKey, flow_key: normalizedFlowKey, role: 'user', content: userMessage },
            { client_id: clientId, stage_key: stageKey, flow_key: normalizedFlowKey, role: 'assistant', content: assistantMessage || '' }
        ]);
    }

    async _saveMessagesWithStageKeys(clientId, userStageKey, assistantStageKey, userMessage, assistantMessage, flowKey = DEFAULT_FLOW_KEY) {
        const normalizedFlowKey = this._normalizeFlowKey(flowKey);
        await knex('ai_b2c_chat_messages').insert([
            { client_id: clientId, stage_key: userStageKey, flow_key: normalizedFlowKey, role: 'user', content: userMessage },
            { client_id: clientId, stage_key: assistantStageKey, flow_key: normalizedFlowKey, role: 'assistant', content: assistantMessage || '' }
        ]);
    }

    async _ensureDefaultFlow(projectId) {
        if (!projectId) return;
        const exists = await knex('ai_b2c_flows')
            .where({ project_id: projectId, flow_key: DEFAULT_FLOW_KEY })
            .first();
        if (exists) return;

        await knex('ai_b2c_flows').insert({
            project_id: projectId,
            flow_key: DEFAULT_FLOW_KEY,
            title: 'Основной сценарий',
            description: null,
            is_active: true,
        });
    }

    async listFlows(projectId) {
        await this._ensureDefaultFlow(projectId);
        return knex('ai_b2c_flows')
            .where({ project_id: projectId })
            .orderBy('id', 'asc');
    }

    async createFlow(projectId, payload = {}) {
        const flowKey = this._normalizeFlowKey(payload.flow_key);
        if (flowKey === DEFAULT_FLOW_KEY) {
            const err = new Error('flow_key cannot be "default" when creating a new flow');
            err.statusCode = 400;
            throw err;
        }

        const title = String(payload.title || '').trim();
        if (!title) {
            const err = new Error('title is required');
            err.statusCode = 400;
            throw err;
        }

        await this._ensureDefaultFlow(projectId);

        const duplicate = await knex('ai_b2c_flows')
            .where({ project_id: projectId, flow_key: flowKey })
            .first();
        if (duplicate) {
            const err = new Error(`flow_key "${flowKey}" already exists`);
            err.statusCode = 400;
            throw err;
        }

        const [id] = await knex('ai_b2c_flows').insert({
            project_id: projectId,
            flow_key: flowKey,
            title,
            description: payload.description || null,
            is_active: payload.is_active !== undefined ? !!payload.is_active : true,
        });

        const cloneFrom = this._normalizeFlowKey(payload.clone_from || DEFAULT_FLOW_KEY);
        if (cloneFrom) {
            await this._cloneFlowData(projectId, cloneFrom, flowKey);
        }

        return knex('ai_b2c_flows').where({ id }).first();
    }

    async _cloneFlowData(projectId, sourceFlowKey, targetFlowKey) {
        const source = this._normalizeFlowKey(sourceFlowKey);
        const target = this._normalizeFlowKey(targetFlowKey);
        if (source === target) return;

        const brainRows = await knex('ai_b2c_brain_contexts')
            .where({ project_id: projectId, flow_key: source });
        if (brainRows.length) {
            await knex('ai_b2c_brain_contexts').insert(
                brainRows.map(({ id, created_at, updated_at, flow_key, ...rest }) => ({
                    ...rest,
                    flow_key: target,
                }))
            );
        }

        const stageRows = await knex('ai_b2c_stage_contexts')
            .where({ project_id: projectId, flow_key: source });
        if (stageRows.length) {
            await knex('ai_b2c_stage_contexts').insert(
                stageRows.map(({ id, created_at, updated_at, flow_key, ...rest }) => ({
                    ...rest,
                    flow_key: target,
                }))
            );
        }

        const settings = await knex('ai_b2c_settings')
            .where({ project_id: projectId, flow_key: source })
            .first();
        if (settings) {
            const { id, created_at, updated_at, flow_key, ...rest } = settings;
            await knex('ai_b2c_settings').insert({
                ...rest,
                flow_key: target,
                avatar_url: null,
            });
        }
    }
}

module.exports = new AiB2cService();
