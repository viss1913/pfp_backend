const knex = require('../config/database');

class AgentService {
    /**
     * Get all agents for synchronization
     * @param {Object} filters 
     * @returns {Promise<Array>}
     */
    async getAllAgentsForSync(filters = {}) {
        const query = knex('agents').select('*');

        if (filters.updated_since) {
            query.where('updated_at', '>=', new Date(filters.updated_since));
        }

        if (filters.is_active !== undefined) {
            query.where('is_active', filters.is_active === 'true' || filters.is_active === true);
        }

        return await query.orderBy('updated_at', 'asc');
    }

    /**
     * Create a new agent
     * @param {Object} data 
     * @returns {Promise<Object>}
     */
    async createAgent(data) {
        const [id] = await knex('agents').insert({
            ...data,
            created_at: new Date(),
            updated_at: new Date()
        }).returning('id');

        const agentId = typeof id === 'object' ? id.id : id;
        return await this.getAgentById(agentId);
    }

    /**
     * Get agent by ID
     * @param {number} id 
     * @returns {Promise<Object>}
     */
    async getAgentById(id) {
        return await knex('agents').where('id', id).first();
    }

    /**
     * Update agent data
     * @param {number} id 
     * @param {Object} data 
     * @returns {Promise<Object>}
     */
    async updateAgent(id, data) {
        await knex('agents').where('id', id).update({
            ...data,
            updated_at: new Date()
        });
        return await this.getAgentById(id);
    }
}

module.exports = new AgentService();
