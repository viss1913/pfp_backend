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

class AiB2cService {

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
    async _buildPrompt(clientId, projectId, stageKey, userMessage) {
        // Параллельно загружаем все данные
        const [brainContexts, stageContext, clientData, history] = await Promise.all([
            this._getBrainContexts(projectId),
            this._getStageContext(projectId, stageKey),
            this._getClientData(clientId),
            this._getChatHistory(clientId, stageKey),
        ]);

        // Слой 1: Главный Мозг
        const brainSection = brainContexts
            .map(ctx => `--- ${ctx.title}\n${ctx.content}`)
            .join('\n\n');

        // Слой 2: Контекст этапа
        const stageSection = stageContext
            ? `КОНТЕКСТ ТЕКУЩЕГО ЭТАПА "${stageContext.title}" (stage: ${stageKey}):\n${stageContext.content}`
            : `Этап: ${stageKey} (контекст не настроен)`;

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

СЛОЙ 1 (ГЛАВНЫЙ МОЗГ — БАЗОВЫЕ ЗНАНИЯ И ИНСТРУКЦИИ):
${brainSection || 'Ты — опытный финансовый консультант. Помогай клиенту с финансовым планированием.'}

СЛОЙ 2 (КОНТЕКСТ ТЕКУЩЕГО ЭТАПА):
${stageSection}

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
}

module.exports = new AiB2cService();
