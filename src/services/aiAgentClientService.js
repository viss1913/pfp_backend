const fs = require('fs');
const path = require('path');
const knex = require('../config/database');
const aiService = require('./aiService');
const aiAssistantService = require('./aiAssistantService');
const clientService = require('./clientService');

const ASSISTANT_SLUG = 'ai-agent-client-lk';
const PROMPT_PATH = path.join(__dirname, '..', '..', 'data', 'prompts', 'aiAgentClientAssistantPrompt.txt');
const HISTORY_LIMIT = 40;
const CONTEXT_MAX_CHARS = 25000;

function safeStringify(value) {
    return JSON.stringify(value, null, 2);
}

function trimByChars(value, maxChars = CONTEXT_MAX_CHARS) {
    const text = String(value || '');
    if (text.length <= maxChars) return text;
    return `${text.slice(0, maxChars)}\n...TRUNCATED...`;
}

function loadPromptTemplate() {
    try {
        return fs.readFileSync(PROMPT_PATH, 'utf8').trim();
    } catch (error) {
        console.warn('[AiAgentClientService] Failed to load prompt file:', error.message);
        return 'Ты AI-ассистент финансового агента. Работай только на данных клиента из контекста и не выдумывай факты.';
    }
}

function formatContext(client) {
    const compactClient = {
        id: client?.id,
        project_id: client?.project_id,
        agent_id: client?.agent_id,
        first_name: client?.first_name,
        last_name: client?.last_name,
        middle_name: client?.middle_name,
        email: client?.email,
        phone: client?.phone,
        age: client?.age,
        gender: client?.gender,
        monthly_income: client?.monthly_income,
        spouse_avg_monthly_income: client?.spouse_avg_monthly_income,
        monthly_expenses: client?.monthly_expenses,
        net_worth: client?.net_worth,
        assets_total: client?.assets_total,
        liabilities_total: client?.liabilities_total,
        total_liquid_capital: client?.total_liquid_capital,
        risk_profile: client?.risk_profile,
        family_profile: client?.family_profile,
        tax_children: client?.tax_children,
        goals_summary: client?.goals_summary
    };

    const payload = [
        '### CLIENT_PROFILE_FULL',
        safeStringify(compactClient),
        '### CLIENT_ASSETS',
        safeStringify(Array.isArray(client?.assets) ? client.assets : []),
        '### CLIENT_LIABILITIES',
        safeStringify(Array.isArray(client?.liabilities) ? client.liabilities : []),
        '### CLIENT_EXPENSES',
        safeStringify(Array.isArray(client?.expenses) ? client.expenses : []),
        '### CLIENT_GOALS',
        safeStringify(Array.isArray(client?.goals) ? client.goals : [])
    ].join('\n\n');

    return trimByChars(payload);
}

function accessError(message, statusCode) {
    const err = new Error(message);
    err.statusCode = statusCode;
    return err;
}

class AiAgentClientService {
    async getOrCreateAssistant() {
        let assistant = await aiAssistantService.getBySlug(ASSISTANT_SLUG);
        if (assistant) return assistant;

        assistant = await aiAssistantService.create({
            name: 'AI Agent Client LK',
            slug: ASSISTANT_SLUG,
            context_template: loadPromptTemplate(),
            model: (process.env.OPENROUTER_MODEL || '').trim() || 'Qwen/Qwen2.5-14B-Instruct',
            is_active: true
        });
        return assistant;
    }

    async addMessage(agentId, assistantId, clientId, role, content) {
        await knex('ai_agent_client_chat_history').insert({
            agent_id: agentId,
            assistant_id: assistantId,
            client_id: clientId,
            role,
            content
        });

        const cutoff = await knex('ai_agent_client_chat_history')
            .where({
                agent_id: agentId,
                assistant_id: assistantId,
                client_id: clientId
            })
            .orderBy('id', 'desc')
            .limit(1)
            .offset(HISTORY_LIMIT - 1)
            .select('id')
            .first();

        if (cutoff) {
            await knex('ai_agent_client_chat_history')
                .where({
                    agent_id: agentId,
                    assistant_id: assistantId,
                    client_id: clientId
                })
                .where('id', '<', cutoff.id)
                .del();
        }
    }

    async getHistory(agentId, assistantId, clientId, limit = HISTORY_LIMIT) {
        return knex('ai_agent_client_chat_history')
            .where({
                agent_id: agentId,
                assistant_id: assistantId,
                client_id: clientId
            })
            .orderBy('created_at', 'desc')
            .limit(limit)
            .then((rows) => rows.reverse());
    }

    async clearHistory(agentId, assistantId, clientId) {
        return knex('ai_agent_client_chat_history')
            .where({
                agent_id: agentId,
                assistant_id: assistantId,
                client_id: clientId
            })
            .del();
    }

    async chatStream({ agent, projectId, clientId, message, assistantId, res }) {
        if (!clientId || !message) {
            throw accessError('client_id and message are required', 400);
        }
        if (!projectId) {
            throw accessError('Project context is missing', 400);
        }

        const resolvedAgentId = agent.agentId || agent.id;
        if (!resolvedAgentId) {
            throw accessError('Agent is not resolved', 401);
        }

        let assistant = null;
        if (assistantId) {
            assistant = await aiAssistantService.getById(assistantId);
        }
        if (!assistant) {
            assistant = await this.getOrCreateAssistant();
        }

        const client = await clientService.getFullClient(clientId, projectId);
        if (!client) {
            throw accessError('Client not found in current project', 404);
        }

        if (client.agent_id && Number(client.agent_id) !== Number(resolvedAgentId)) {
            throw accessError('Access denied to this client', 403);
        }

        const promptTemplate = loadPromptTemplate();
        const runtimeContext = formatContext(client);
        const systemPrompt = aiService.injectContext(`${promptTemplate}\n\n${runtimeContext}`, agent);

        const history = await this.getHistory(resolvedAgentId, assistant.id, clientId);
        const messages = [];
        if (systemPrompt && systemPrompt.trim()) {
            messages.push({ role: 'system', content: systemPrompt });
        }
        history.forEach((msg) => messages.push({ role: msg.role, content: msg.content }));
        messages.push({ role: 'user', content: message });

        await this.addMessage(resolvedAgentId, assistant.id, clientId, 'user', message);

        const selectedModel = (process.env.OPENROUTER_MODEL || '').trim() || assistant.model;
        const fullAiResponse = await aiService.streamCompletion(messages, selectedModel, res);
        if (fullAiResponse) {
            await this.addMessage(resolvedAgentId, assistant.id, clientId, 'assistant', fullAiResponse);
        }

        return { assistantId: assistant.id, model: selectedModel };
    }
}

module.exports = new AiAgentClientService();
