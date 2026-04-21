const knexConfig = require('../../knexfile');
const knexEnv = process.env.NODE_ENV || 'development';
const knex = require('knex')(knexConfig[knexEnv] || knexConfig.development);

class AiHistoryService {
    async addMessage(agentId, assistantId, role, content) {
        await knex('ai_chat_history').insert({
            agent_id: agentId,
            assistant_id: assistantId,
            role,
            content
        });

        // Enforce 20 message limit: Keep only the latest 20 messages
        // Fetch the 20th most recent message ID to determine the cutoff
        const cutoffRow = await knex('ai_chat_history')
            .where({ agent_id: agentId, assistant_id: assistantId })
            .orderBy('id', 'desc')
            .limit(1)
            .offset(19) // Skip top 19 to find the 20th
            .select('id')
            .first();

        if (cutoffRow) {
            // Delete messages older than the 20th message (i.e., smaller IDs)
            await knex('ai_chat_history')
                .where({ agent_id: agentId, assistant_id: assistantId })
                .where('id', '<', cutoffRow.id)
                .del();
        }

        return true;
    }

    async getHistory(agentId, assistantId, limit = 20) {
        return knex('ai_chat_history')
            .where({ agent_id: agentId, assistant_id: assistantId })
            .orderBy('created_at', 'desc') // Get latest first
            .limit(limit)
            .then(rows => rows.reverse()); // Return in chronological order
    }
}

module.exports = new AiHistoryService();
