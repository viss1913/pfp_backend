const db = require('../config/database');
const aiService = require('./aiService');

class CrmService {
    /**
     * Retrieves specific clients that need attention (Thinking or Renewal)
     */
    async getAttentionRequiredClients(agentId) {
        // 1. Clients who are "THINKING" (Daily check)
        // In a real app we might filter by last_contact_date, but requirement is "every day"
        const thinkingClients = await db('clients')
            .where({
                agent_id: agentId,
                crm_status: 'THINKING'
            })
            .select('id', 'first_name', 'last_name', 'phone', 'crm_status_date', 'goals_summary');

        // 2. Clients ready for "RENEWAL"
        const today = new Date();
        const renewalClients = await db('clients')
            .where({
                agent_id: agentId,
                crm_status: 'RENEWAL'
            })
            .andWhere('next_action_date', '<=', today)
            .select('id', 'first_name', 'last_name', 'phone', 'next_action_date');

        return { thinkingClients, renewalClients };
    }

    /**
     * Get detailed summary of all clients for AI Context
     * Includes: Financial breakdown, Top Goals, Portfolio Structure
     */
    async getDetailedAgentClientsSummary(agentId) {
        const clients = await db('clients')
            .where({ agent_id: agentId })
            .select('*');

        const summary = [];

        for (const client of clients) {
            let financials = {};
            try {
                // Determine financial health
                const goalsSum = typeof client.goals_summary === 'string' ? JSON.parse(client.goals_summary) : (client.goals_summary || {});

                // Extract key metrics
                const netWorth = client.net_worth || 0;
                const assets = client.assets_total || 0;
                const goalsCount = goalsSum.summary?.goals_count || 0;

                // Find top priority goal
                const topGoal = goalsSum.calculation?.goals?.[0]?.goal_name || 'Нет целей';
                const targetAmount = goalsSum.calculation?.goals?.[0]?.summary?.total_target_amount_future || 0;

                // Portfolio Strategy (from Consolidated)
                const strategy = goalsSum.summary?.consolidated_portfolio?.assets_allocation?.[0]?.name || 'Не сформирован';

                financials = {
                    net_worth: Math.round(netWorth),
                    goals_count: goalsCount,
                    top_goal: topGoal,
                    target: Math.round(targetAmount),
                    main_asset: strategy
                };

            } catch (e) {
                financials = { error: 'Data parsing failed' };
            }

            summary.push({
                id: client.id,
                name: `${client.last_name} ${client.first_name}`,
                phone: client.phone,
                email: client.email,
                status: client.crm_status, // THINKING, BOUGHT, etc.
                next_action: client.next_action_date ? new Date(client.next_action_date).toLocaleDateString() : 'N/A',
                finance: financials
            });
        }

        return summary;
    }

    /**
     * Generates the daily briefing text using AI
     */
    async generateDailyBriefing(agentId) {
        const allClients = await this.getDetailedAgentClientsSummary(agentId);

        if (allClients.length === 0) {
            return "Доброе утро! В вашей базе пока нет клиентов. Как только вы их добавите, я смогу подготовить для вас аналитическую сводку.";
        }

        const thinking = allClients.filter(c => c.status === 'THINKING');
        const renewal = allClients.filter(c => c.status === 'RENEWAL');
        const bought = allClients.filter(c => c.status === 'BOUGHT');

        // Build prompt context
        let contextData = "CRM Portfolio Summary:\n";
        contextData += `- Total Clients: ${allClients.length}\n`;
        contextData += `- Thinking: ${thinking.length}\n`;
        contextData += `- Renewal: ${renewal.length}\n`;
        contextData += `- Bought: ${bought.length}\n\n`;

        contextData += "Client Details for Analysis:\n";
        allClients.forEach(c => {
            contextData += `- [${c.status}] ${c.name} (ID: ${c.id}). `;
            if (c.phone) contextData += `Тел: ${c.phone}. `;
            if (c.email) contextData += `Email: ${c.email}. `;
            if (c.finance.error) {
                contextData += "Финансовые данные не заполнены. ";
            } else {
                contextData += `Капитал: ${c.finance.net_worth.toLocaleString()}₽. Цель: ${c.finance.top_goal}. `;
            }
            contextData += `След. шаг: ${c.next_action}\n`;
        });

        const systemPrompt = `Ты — элитный бизнес-ассистент финансового советника по имени {{agent_name}}. Твоя цель — быть правым плечом агента, помогать ему анализировать портфель и максимизировать эффективность работы с клиентами.
        
        ВХОДНЫЕ ДАННЫЕ (Твоя база знаний на сегодня):
        ${contextData}

        ТВОЙ СТИЛЬ:
        - Профессиональный, уверенный, энергичный и лаконичный.
        - Ты не просто робот, ты — партнер в бизнесе.
        - Обращайся к агенту уважительно, подчеркивая важность его задач.

        ИНСТРУКЦИЯ ПО СОСТАВЛЕНИЮ БРИФИНГА:
        1. Начни с профессионального приветствия: "Доброе утро, {{agent_name}}. Подготовил для вас аналитический срез по портфелю на сегодня."
        2. Дай краткую сводку: сколько клиентов в фокусе, какие ключевые изменения.
        3. СТРАТЕГИЧЕСКИЕ ПРИОРИТЕТЫ:
           - [RENEWAL]: Это ваш приоритет №1. Напомните, у кого подходят сроки.
           - [THINKING]: Выделите тех, кто на паузе. Предложите 1 убийственный аргумент для звонка, опираясь на их цель (${allClients.length > 0 ? 'например, ' + allClients[0].finance.top_goal : 'финансы'}).
        4. ЗАВЕРШЕНИЕ: Мотивирующее напутствие на день.
        
        Формат: Четкий маркированный список с акцентом на действия.
        `;

        // Execute AI call using OPENROUTER_MODEL from env when available
        const messages = [{ role: 'system', content: systemPrompt }];
        const selectedModel = (process.env.OPENROUTER_MODEL || '').trim() || 'Qwen/Qwen2.5-14B-Instruct';
        return await aiService.getCompletion(messages, selectedModel);
    }

    async updateClientStatus(clientId, status, notes, projectId = null) {
        const updateData = {
            crm_status: status,
            crm_status_date: db.fn.now(),
            updated_at: db.fn.now()
        };

        const filter = { id: clientId };
        if (projectId) filter.project_id = projectId;

        // Automatic logic for reminders
        if (status === 'THINKING') {
            // Remind tomorrow
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            updateData.next_action_date = tomorrow;
        } else if (status === 'RENEWAL') {
            // Default renewal logic (e.g., set for 1 year from now? or let user set it? 
            // For now, let's strictly update the status. The frontend might send next_action_date later or we default.)
            // updateData.next_action_date = ... 
        } else {
            // Bought/Refused -> Clear reminder
            updateData.next_action_date = null;
        }

        if (notes) {
            updateData.notes = notes; // Assuming simple note append or overwrite. 
            // Better: append to notes/history. But schema has simple 'notes'.
        }

        await db('clients').where(filter).update(updateData);
        return { success: true, status, clientId };
    }
}

module.exports = new CrmService();
