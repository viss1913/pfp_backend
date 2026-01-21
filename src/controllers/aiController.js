const aiAssistantService = require('../services/aiAssistantService');
const aiHistoryService = require('../services/aiHistoryService');
const aiService = require('../services/aiService');
const crmService = require('../services/crmService');

class AiController {
    async listAssistants(req, res) {
        try {
            const assistants = await aiAssistantService.getActive();
            // Map to match AiAssistantShort schema (add descriptions if needed, currently reusing name/context)
            const result = assistants.map(a => ({
                id: a.id,
                name: a.name,
                slug: a.slug,
                description: a.context_template // Or truncate it
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
            const history = await aiHistoryService.getHistory(req.user.id, assistant_id);
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

            // 1. Get Assistant
            const assistant = await aiAssistantService.getById(assistant_id);
            if (!assistant) return res.status(404).json({ error: 'Assistant not found' });

            // [NEW] DYNAMIC CONTEXT INJECTION FOR CRM
            // If this is the CRM Assistant (ID 1) or slug 'ai-crm', inject rich client data
            if (assistant.id == 1 || assistant.slug === 'ai-crm') {
                try {
                    const agentIdToUse = agent.agentId || agent.id; // Try agentId first (JWT), then id
                    console.log(`[AiController] DEBUG AUTH: User ID (agent.id): ${agent.id}, Agent ID Field (agent.agentId): ${agent.agentId}, Final Used ID: ${agentIdToUse}`);

                    // Fetch DEEP Summary for all clients
                    const allClients = await crmService.getDetailedAgentClientsSummary(agentIdToUse);
                    console.log(`[AiController] Found ${allClients.length} clients for context.`);

                    let clientContext = "\n\n=== ПОЛНОЕ ДОСЬЕ НА КЛИЕНТОВ (Только для твоих глаз) ===\n";

                    if (allClients.length === 0) {
                        clientContext += "Список клиентов пуст.\n";
                    } else {
                        // Dump ALL clients with full details
                        clientContext += `Всего клиентов: ${allClients.length}.\n`;

                        allClients.forEach(c => {
                            const financeInfo = c.finance.error
                                ? "Нет финансовых данных"
                                : `Капитал: ${c.finance.net_worth?.toLocaleString()} ₽. Цель: ${c.finance.top_goal} (${c.finance.target?.toLocaleString()} ₽). Портфель: ${c.finance.main_asset}`;

                            clientContext += `- [${c.status}] ${c.name} (ID: ${c.id}). ${financeInfo}.\n`;
                        });
                    }

                    // Add to system prompt
                    assistant.context_template += clientContext;
                    assistant.context_template += `\n\n[SYSTEM DEBUG]: В этом контексте загружено ${allClients.length} клиентов.`;
                    assistant.context_template += "\n\nИНСТРУКЦИЯ ПО РАБОТЕ С ДАННЫМИ:\n" +
                        "- Ты видишь полный список клиентов агента и их финансы.\n" +
                        "- [THINKING] или [Думает] = Лид, с которым нужно работать.\n" +
                        "- Используй цифры капитала и целей для точных советов.\n" +
                        "- НЕ выдумывай данные, которых нет в списке.";
                    assistant.context_template += "\n- ВАЖНО: Если клиентов > 0, отвечай точно по списку. Если 0 — скажи 'База пуста'.";
                    // assistant.context_template += "\n- ДЛЯ ОТЛАДКИ: Начни ответ с фразы '(Загружено клиентов: X)', где X - число из SYSTEM DEBUG.";

                } catch (ctxErr) {
                    console.error('Failed to inject CRM context:', ctxErr);
                }
            }

            // 2. Prepare Context (System Prompt)
            const systemPrompt = aiService.injectContext(assistant.context_template, agent);

            // 3. Get History
            const history = await aiHistoryService.getHistory(agent.id, assistant_id);

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
            await aiHistoryService.addMessage(agent.id, assistant_id, 'user', message);

            // 6. Setup Headers for SSE
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            // 7. Call OpenRouter & Stream
            // streamCompletion handles writing to res and returns full text
            const fullAiResponse = await aiService.streamCompletion(messages, assistant.model, res);

            // 8. Save AI message to DB
            if (fullAiResponse) {
                await aiHistoryService.addMessage(agent.id, assistant_id, 'assistant', fullAiResponse);
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
}

module.exports = new AiController();
