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
        // Using ID 1's model logic ideally, but for internal service calls usually we fix a model or use config
        // Here we use Qwen explicitly or allow default
        return await aiService.getCompletion(messages, 'Qwen/Qwen2.5-7B-Instruct');
    }
}

module.exports = new CrmService();
