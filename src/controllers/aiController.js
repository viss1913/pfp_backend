const aiAssistantService = require('../services/aiAssistantService');
const aiHistoryService = require('../services/aiHistoryService');
const aiService = require('../services/aiService');
const crmService = require('../services/crmService');
const clientService = require('../services/clientService');
const productService = require('../services/productService');
const portfolioService = require('../services/portfolioService');
const aiAgentClientService = require('../services/aiAgentClientService');
const fs = require('fs');
const path = require('path');

const PLAN_ASSISTANT_SLUG = 'ai-plan-assistant';
const PLAN_ASSISTANT_PROMPT_PATH = path.join(__dirname, '..', '..', 'data', 'prompts', 'aiPlanAssistantPrompt.txt');

function getAssistantShortDescription(assistant) {
    const descriptionsBySlug = {
        'ai-crm': 'CRM-ассистент: приоритеты по клиентам, статусы и следующие шаги продаж.',
        'ai-pfp': 'Продуктовый ассистент: помогает по продуктам PFP и финансовым сценариям.'
    };

    if (assistant.slug && descriptionsBySlug[assistant.slug]) {
        return descriptionsBySlug[assistant.slug];
    }

    if (!assistant.context_template) {
        return `Ассистент ${assistant.name}`;
    }

    const compactTemplate = assistant.context_template.replace(/\s+/g, ' ').trim();
    return compactTemplate.slice(0, 140);
}

function stringifySafe(value) {
    return JSON.stringify(value, null, 2);
}

function trimText(value, fallback = '—') {
    const text = String(value == null ? '' : value).trim();
    return text || fallback;
}

function summarizeProducts(products) {
    const active = (products || []).filter((p) => p.is_active !== false);
    return active.slice(0, 40).map((p) => ({
        id: p.id,
        name: p.name,
        product_type: p.product_type || null,
        description: trimText(p.description, ''),
        currency: p.currency || 'RUB',
        is_default: !!p.is_default
    }));
}

function summarizePortfolios(portfolios) {
    const active = (portfolios || []).filter((p) => p.is_active !== false);
    return active.slice(0, 30).map((p) => ({
        id: p.id,
        name: p.name,
        description: trimText(p.description, ''),
        classes: Array.isArray(p.classes) ? p.classes.map((c) => c?.name || c?.code || c?.id).filter(Boolean) : [],
        risk_profiles: Array.isArray(p.riskProfiles) ? p.riskProfiles.map((rp) => rp?.profile_type).filter(Boolean) : [],
        is_default: !!p.is_default
    }));
}

function buildPlanAssistantRuntimeContext({ client, products, portfolios }) {
    const goalsSummary = client?.goals_summary || null;
    const goals = Array.isArray(client?.goals) ? client.goals : [];
    const compactClient = {
        id: client?.id,
        first_name: client?.first_name,
        last_name: client?.last_name,
        phone: client?.phone,
        email: client?.email,
        avg_monthly_income: client?.avg_monthly_income,
        spouse_avg_monthly_income: client?.spouse_avg_monthly_income,
        net_worth: client?.net_worth,
        assets_total: client?.assets_total,
        liabilities_total: client?.liabilities_total,
        goals_count: goals.length
    };

    return [
        '### КАРТОЧКА КЛИЕНТА',
        stringifySafe(compactClient),
        '### ЦЕЛИ КЛИЕНТА',
        stringifySafe(goals),
        '### GOALS_SUMMARY',
        stringifySafe(goalsSummary),
        '### ДОСТУПНЫЕ ПРОДУКТЫ ПРОЕКТА',
        stringifySafe(summarizeProducts(products)),
        '### ДОСТУПНЫЕ ПОРТФЕЛИ ПРОЕКТА',
        stringifySafe(summarizePortfolios(portfolios))
    ].join('\n\n');
}

function loadPlanAssistantPromptTemplate() {
    try {
        return fs.readFileSync(PLAN_ASSISTANT_PROMPT_PATH, 'utf8').trim();
    } catch (e) {
        console.warn('[AiController] Failed to read aiPlanAssistantPrompt.txt:', e.message);
        return 'Ты — AI-помощник финансового консультанта. Помогай агенту разбирать план клиента и объяснять варианты продуктов и портфелей только на основе переданного контекста.';
    }
}

class AiController {
    async listAssistants(req, res) {
        try {
            const assistants = await aiAssistantService.getActive();
            const result = assistants.map(a => ({
                id: a.id,
                name: a.name,
                slug: a.slug,
                description: getAssistantShortDescription(a)
            }));
            res.json(result);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to list assistants' });
        }
    }

    async getHistory(req, res) {
        try {
            const { assistant_id } = req.params;
            const agentId = req.user.agentId || req.user.id;

            let history = await aiHistoryService.getHistory(agentId, assistant_id);

            // [NEW] Check for Daily Briefing injection (Empty history OR > 8 hours inactivity)
            const lastMessage = history.length > 0 ? history[history.length - 1] : null;
            let shouldInjectBrief = false;

            if (history.length === 0) {
                shouldInjectBrief = true;
            } else if (lastMessage) {
                const lastMsgTime = new Date(lastMessage.created_at);
                const now = new Date();
                const diffHours = (now - lastMsgTime) / (1000 * 60 * 60);
                if (diffHours >= 8) {
                    shouldInjectBrief = true;
                }
            }

            if (shouldInjectBrief) {
                const assistant = await aiAssistantService.getById(assistant_id);
                if (assistant && (assistant.id == 1 || assistant.slug === 'ai-crm')) {
                    console.log(`[AiController] CRM Context Check: Empty=${history.length === 0}, LastMsgAge=${lastMessage ? ((new Date() - new Date(lastMessage.created_at)) / 3600000).toFixed(1) + 'h' : 'N/A'}. Generating Brief...`);

                    try {
                        const brief = await crmService.generateDailyBriefing(agentId, req.user || null);
                        if (brief) {
                            // Save to DB
                            await aiHistoryService.addMessage(agentId, assistant_id, 'assistant', brief);

                            // Re-fetch history to include the new brief and respect the limit/sorting
                            // (Or just append it, but re-fetching is safer for ID consistency if we need it)
                            history = await aiHistoryService.getHistory(agentId, assistant_id);
                        }
                    } catch (briefErr) {
                        console.error('Failed to generate auto-brief:', briefErr);
                    }
                }
            }

            res.json(history);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to get history' });
        }
    }

    async chatStream(req, res) {
        try {
            console.log('[AiController] chatStream called. Body:', JSON.stringify(req.body, null, 2));
            const { assistant_id, message } = req.body;
            const agent = req.user;
            const promptAgent = { ...agent };
            const resolvedAgentId = agent.agentId || agent.id;

            // 1. Get Assistant
            const assistant = await aiAssistantService.getById(assistant_id);
            if (!assistant) return res.status(404).json({ error: 'Assistant not found' });

            // [NEW] DYNAMIC CONTEXT INJECTION FOR CRM
            // If this is the CRM Assistant (ID 1) or slug 'ai-crm', inject rich client data
            if (assistant.id == 1 || assistant.slug === 'ai-crm') {
                try {
                    promptAgent.name = await crmService.resolveAgentDisplayName(resolvedAgentId, agent);
                    console.log(`[AiController] DEBUG AUTH: User ID (agent.id): ${agent.id}, Agent ID Field (agent.agentId): ${agent.agentId}, Final Used ID: ${resolvedAgentId}`);

                    // Fetch DEEP Summary for all clients
                    const allClients = await crmService.getDetailedAgentClientsSummary(resolvedAgentId);
                    console.log(`[AiController] Found ${allClients.length} clients for context.`);

                    let clientContext = "\n\n=== ПОЛНОЕ ДОСЬЕ КЛИЕНТОВ (Только для системы) ===\n";

                    if (allClients.length === 0) {
                        clientContext += "Список клиентов пуст.\n";
                    } else {
                        clientContext += `У вас в базе ${allClients.length} клиентов. Вот актуальный срез:\n`;

                        allClients.forEach(c => {
                            const fin = c.finance;
                            const finStr = fin.error
                                ? "Данные не заполнены"
                                : `Капитал: ${fin.net_worth.toLocaleString()}₽, Цель: ${fin.top_goal} (${fin.target.toLocaleString()}₽), Активы: ${fin.main_asset}`;

                            const contactStr = `Тел: ${c.phone || 'нет'}, Email: ${c.email || 'нет'}`;
                            clientContext += `- [${c.status}] ${c.name} (ID: ${c.id}). ${contactStr}. ${finStr}. След. контакт: ${c.next_action}\n`;
                        });
                    }

                    // Add to system prompt
                    assistant.context_template += clientContext;
                    assistant.context_template += "\n\nЛИЧНОСТЬ И РОЛЬ:\n" +
                        "- Ты — элитный бизнес-ассистент финансового советника {{agent_name}}.\n" +
                        "- Твоя манера общения: профессиональная, экспертная, энергичная и сфокусированная на результате.\n" +
                        "- Ты отлично знаешь каждого клиента из представленного выше списка и помогаешь {{agent_name}} эффективно ими управлять.\n\n" +
                        "ИНСТРУКЦИЯ ПО РАБОТЕ С БАЗОЙ:\n" +
                        "- Если {{agent_name}} спрашивает 'кто у меня на продлении' или 'кому позвонить', ИЩИ В СПИСКЕ ВЫШЕ статус [RENEWAL] или [THINKING].\n" +
                        "- Для статуса [BOUGHT] и высокого капитала предлагай идеи для масштабирования или кросс-продаж.\n" +
                        "- Будь краток, называй клиентов по именам и давай конкретные цифры.\n" +
                        "- Если агент просит найти кого-то по условию (например, капитал > 1 млн), прошерсти список и выведи только подходящих.";

                } catch (ctxErr) {
                    console.error('Failed to inject CRM context:', ctxErr);
                }
            }

            // 2. Prepare Context (System Prompt)
            const systemPrompt = aiService.injectContext(assistant.context_template, promptAgent);

            // 3. Get History
            const history = await aiHistoryService.getHistory(resolvedAgentId, assistant_id);

            // 3. Construct Messages Payload
            const messages = [];
            if (systemPrompt && systemPrompt.trim().length > 0) {
                console.log('[AiController] FINAL SYSTEM PROMPT SNIPPET:', systemPrompt.substring(0, 500) + '...');
                messages.push({ role: 'system', content: systemPrompt });
            }

            // Add history
            history.forEach(msg => {
                messages.push({ role: msg.role, content: msg.content });
            });
            messages.push({ role: 'user', content: message });

            // 5. Save USER message to DB
            await aiHistoryService.addMessage(resolvedAgentId, assistant_id, 'user', message);

            // 6. Setup Headers for SSE
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            // 7. Call OpenRouter & Stream
            // Railway env model must have priority over DB-configured assistant model.
            const selectedModel = (process.env.OPENROUTER_MODEL || '').trim() || assistant.model;
            console.log(`[AiController] Selected model for chat: ${selectedModel}`);
            // streamCompletion handles writing to res and returns full text
            const fullAiResponse = await aiService.streamCompletion(messages, selectedModel, res);

            // 8. Save AI message to DB
            if (fullAiResponse) {
                await aiHistoryService.addMessage(resolvedAgentId, assistant_id, 'assistant', fullAiResponse);
            }

        } catch (err) {
            console.error('Chat Error:', err.message); // Log only message to avoid huge dumps
            // If headers sent, we can't send 500 JSON, maybe send SSE error
            if (!res.headersSent) {
                res.status(500).json({ error: 'Chat failed', details: err.message });
            } else {
                res.write(`data: {"error": "Internal Error"}\n\n`);
                res.end();
            }
        }
    }

    async planAssistantChatStream(req, res) {
        try {
            const { client_id, message, assistant_id } = req.body || {};
            const agent = req.user || {};
            const resolvedAgentId = agent.agentId || agent.id;
            const projectId = req.projectId || agent.projectId;

            if (!client_id || !message) {
                return res.status(400).json({ error: 'client_id and message are required' });
            }
            if (!projectId) {
                return res.status(400).json({ error: 'Project context is missing' });
            }

            let assistant = null;
            if (assistant_id) {
                assistant = await aiAssistantService.getById(assistant_id);
            }
            if (!assistant) {
                assistant = await aiAssistantService.getBySlug(PLAN_ASSISTANT_SLUG);
            }
            if (!assistant) {
                const template = loadPlanAssistantPromptTemplate();
                assistant = await aiAssistantService.create({
                    name: 'AI Plan Assistant',
                    slug: PLAN_ASSISTANT_SLUG,
                    context_template: template,
                    model: (process.env.OPENROUTER_MODEL || '').trim() || 'Qwen/Qwen2.5-14B-Instruct',
                    is_active: true
                });
            }

            const client = await clientService.getFullClient(client_id, projectId);
            if (!client) {
                return res.status(404).json({ error: 'Client not found in current project' });
            }
            if (client.agent_id && Number(client.agent_id) !== Number(resolvedAgentId)) {
                return res.status(403).json({ error: 'Access denied to this client' });
            }

            const [products, portfolios] = await Promise.all([
                productService.getAllProducts(projectId, { includeDefaults: 'true', is_active: 'true' }),
                portfolioService.getAllPortfolios(projectId, { includeDefaults: 'true' })
            ]);

            const promptTemplate = loadPlanAssistantPromptTemplate();
            const runtimeContext = buildPlanAssistantRuntimeContext({ client, products, portfolios });
            const systemPrompt = aiService.injectContext(
                `${promptTemplate}\n\n${runtimeContext}`,
                agent
            );

            const history = await aiHistoryService.getHistory(resolvedAgentId, assistant.id);
            const messages = [];
            if (systemPrompt) {
                messages.push({ role: 'system', content: systemPrompt });
            }
            history.forEach((msg) => {
                messages.push({ role: msg.role, content: msg.content });
            });
            messages.push({ role: 'user', content: message });

            await aiHistoryService.addMessage(resolvedAgentId, assistant.id, 'user', message);

            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const selectedModel = (process.env.OPENROUTER_MODEL || '').trim() || assistant.model;
            console.log(`[AiController] plan-assistant model: ${selectedModel}`);
            const fullAiResponse = await aiService.streamCompletion(messages, selectedModel, res);

            if (fullAiResponse) {
                await aiHistoryService.addMessage(resolvedAgentId, assistant.id, 'assistant', fullAiResponse);
            }
        } catch (err) {
            console.error('[AiController] planAssistantChatStream error:', err.message);
            if (!res.headersSent) {
                return res.status(500).json({ error: 'Plan assistant chat failed', details: err.message });
            }
            res.write(`data: {"error": "Internal Error"}\n\n`);
            res.end();
        }
    }

    async agentClientChatStream(req, res) {
        try {
            const { client_id, message, assistant_id } = req.body || {};
            const agent = req.user || {};
            const projectId = req.projectId || agent.projectId;

            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            await aiAgentClientService.chatStream({
                agent,
                projectId,
                clientId: Number(client_id),
                message,
                assistantId: assistant_id ? Number(assistant_id) : null,
                res
            });
        } catch (err) {
            const status = err.statusCode || 500;
            if (!res.headersSent) {
                return res.status(status).json({ error: err.message || 'Agent client chat failed' });
            }
            res.write(`data: {"error": "${(err.message || 'Internal Error').replace(/"/g, '\\"')}"}\n\n`);
            res.end();
        }
    }

    async agentClientHistory(req, res) {
        try {
            const agent = req.user || {};
            const resolvedAgentId = agent.agentId || agent.id;
            const clientId = Number(req.params.client_id || req.query.client_id);
            const assistantId = Number(req.query.assistant_id);

            if (!clientId || !assistantId) {
                return res.status(400).json({ error: 'client_id and assistant_id are required' });
            }

            const history = await aiAgentClientService.getHistory(resolvedAgentId, assistantId, clientId);
            res.json(history);
        } catch (err) {
            res.status(err.statusCode || 500).json({ error: err.message || 'Failed to get history' });
        }
    }

    async clearAgentClientHistory(req, res) {
        try {
            const agent = req.user || {};
            const resolvedAgentId = agent.agentId || agent.id;
            const clientId = Number(req.params.client_id || req.query.client_id);
            const assistantId = Number(req.query.assistant_id);

            if (!clientId || !assistantId) {
                return res.status(400).json({ error: 'client_id and assistant_id are required' });
            }

            await aiAgentClientService.clearHistory(resolvedAgentId, assistantId, clientId);
            res.json({ success: true });
        } catch (err) {
            res.status(err.statusCode || 500).json({ error: err.message || 'Failed to clear history' });
        }
    }
}

module.exports = new AiController();
