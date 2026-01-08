const knex = require('knex')(require('../../knexfile').development);

class AiHistoryService {
    async addMessage(agentId, assistantId, role, content) {
        return knex('ai_chat_history').insert({
            agent_id: agentId,
            assistant_id: assistantId,
            role,
            content
        });
    }

    async getHistory(agentId, assistantId, limit = 50) {
        return knex('ai_chat_history')
            .where({ agent_id: agentId, assistant_id: assistantId })
            .orderBy('created_at', 'desc') // Get latest first
            .limit(limit)
            .then(rows => rows.reverse()); // Return in chronological order
    }
}

module.exports = new AiHistoryService();
