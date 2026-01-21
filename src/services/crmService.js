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
        const { thinkingClients, renewalClients } = await this.getAttentionRequiredClients(agentId);

        if (thinkingClients.length === 0 && renewalClients.length === 0) {
            return "Доброе утро! На сегодня срочных задач по клиентам нет. Можно заняться поиском новых лидов.";
        }

        // Build prompt context
        let contextData = "Analyzed Clients:\n";

        if (thinkingClients.length > 0) {
            contextData += "\n[STATUS: THINKING - Needs Nudge]\n";
            thinkingClients.forEach(c => {
                contextData += `- ${c.first_name} ${c.last_name} (Thinking since ${new Date(c.crm_status_date).toLocaleDateString()}). Info: ${JSON.stringify(c.goals_summary || 'No details')}\n`;
            });
        }

        if (renewalClients.length > 0) {
            contextData += "\n[STATUS: RENEWAL - Needs Action]\n";
            renewalClients.forEach(c => {
                contextData += `- ${c.first_name} ${c.last_name} (Renewal due: ${new Date(c.next_action_date).toLocaleDateString()})\n`;
            });
        }

        const systemPrompt = `Ты — AI CRM ассистент. Твоя задача — подготовить краткую сводку для агента на день.
        
        ВХОДНЫЕ ДАННЫЕ:
        ${contextData}

        ИНСТРУКЦИЯ:
        1. Поздоровайся.
        2. Для клиентов "THINKING": Предложи 1 конкретное действие (написать, позвонить) и короткую идею для захода (новость, аргумент).
        3. Для клиентов "RENEWAL": Напомни, что пора продлевать.
        4. Будь краток. Ответ должен выглядеть как список задач.
        `;

        // Execute AI call using the new non-streaming method
        const messages = [{ role: 'system', content: systemPrompt }];
        return await aiService.getCompletion(messages, 'Qwen/Qwen2.5-14B-Instruct');
    }

    async updateClientStatus(clientId, status, notes) {
        const updateData = {
            crm_status: status,
            crm_status_date: db.fn.now(),
            updated_at: db.fn.now()
        };

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

        await db('clients').where({ id: clientId }).update(updateData);
        return { success: true, status, clientId };
    }
}

module.exports = new CrmService();
