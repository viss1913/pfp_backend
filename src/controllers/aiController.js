const aiAssistantService = require('../services/aiAssistantService');
const aiHistoryService = require('../services/aiHistoryService');
const aiService = require('../services/aiService');

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
                    // Fetch DEEP Summary for all clients
                    const allClients = await crmService.getDetailedAgentClientsSummary(agent.id);

                    let clientContext = "\n\n=== ПОЛНОЕ ДОСЬЕ НА КЛИЕНТОВ (Только для твоих глаз) ===\n";

                    if (allClients.length === 0) {
                        clientContext += "Список клиентов пуст.\n";
                    } else {
                        // Group by status for readability
                        const thinking = allClients.filter(c => c.status === 'THINKING');
                        const bought = allClients.filter(c => c.status === 'BOUGHT');
                        const others = allClients.filter(c => c.status !== 'THINKING' && c.status !== 'BOUGHT');

                        if (thinking.length > 0) {
                            clientContext += "\n--- 🟡 ЛИДЫ / ДУМАЮТ ---\n";
                            thinking.forEach(c => {
                                clientContext += `- ${c.name} (ID: ${c.id}). Капитал: ${c.finance.net_worth}. Цель: ${c.finance.top_goal}. Портфель: ${c.finance.main_asset}.\n`;
                            });
                        }

                        if (bought.length > 0) {
                            clientContext += "\n--- 🟢 КУПИЛИ (ПЕРЕКРЕСТНЫЕ ПРОДАЖИ) ---\n";
                            bought.forEach(c => {
                                clientContext += `- ${c.name}. Капитал: ${c.finance.net_worth}. Цель: ${c.finance.top_goal} (Сумма: ${c.finance.target}).\n`;
                            });
                        }

                        // Add brief detail for others
                        if (others.length > 0) {
                            clientContext += "\n--- ОСТАЛЬНЫЕ ---\n";
                            others.slice(0, 5).forEach(c => { // Limit context window
                                clientContext += `- ${c.name} (${c.status}).\n`;
                            });
                        }
                    }

                    // Add to system prompt
                    assistant.context_template += clientContext; // Modify assistant's context_template
                    assistant.context_template += "\n\nИНСТРУКЦИЯ ПО РАБОТЕ С ДАННЫМИ:\n" +
                        "- Ты видишь финансовое состояние каждого клиента.\n" +
                        "- Используй это для советов (например: 'Ивану можно предложить облигации, у него консервативный портфель').\n" +
                        "- Если спрашивают 'Кто богатый?', смотри на поле Капитал.\n" +
                        "- НЕ выдумывай цифры, бери их из Досье.";

                } catch (ctxErr) {
                    console.error('Failed to inject CRM context:', ctxErr);
                }
            }

            // 2. Prepare Context (System Prompt)
            const systemPrompt = aiService.injectContext(assistant.context_template, agent);

            // 3. Get History
            const history = await aiHistoryService.getHistory(agent.id, assistant_id);

            // 4. Construct Messages for API
            const messages = [];
            if (systemPrompt && systemPrompt.trim()) {
                messages.push({ role: 'system', content: systemPrompt });
            }

            messages.push(
                ...history.map(h => ({ role: h.role, content: h.content })),
                { role: 'user', content: message }
            );

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
