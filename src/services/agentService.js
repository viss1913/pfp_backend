const knex = require('../config/database');
const bcrypt = require('bcryptjs');

class AgentService {
    /**
     * Get all agents for synchronization
     * @param {Object} filters 
     * @returns {Promise<Array>}
     */
    async getAllAgentsForSync(filters = {}) {
        const query = knex('agents')
            .leftJoin('users', 'agents.id', 'users.agent_id')
            .select('agents.*', 'users.email');

        if (filters.updated_since) {
            query.where('agents.updated_at', '>=', new Date(filters.updated_since));
        }

        if (filters.is_active !== undefined) {
            query.where('agents.is_active', filters.is_active === 'true' || filters.is_active === true);
        }

        return await query.orderBy('agents.updated_at', 'asc');
    }

    /**
     * Create a new agent
     * @param {Object} data 
     * @returns {Promise<Object>}
     */
    async createAgent(data) {
        const { email, password, ...agentData } = data;

        return await knex.transaction(async (trx) => {
            // 1. Create agent profile
            const [id] = await trx('agents').insert({
                ...agentData,
                created_at: new Date(),
                updated_at: new Date()
            });

            const agentId = typeof id === 'object' ? id.id : id;

            // 2. Create user account if email/password provided
            if (email) {
                const passwordHash = password ? await bcrypt.hash(password, 10) : await bcrypt.hash('agent123', 10);
                await trx('users').insert({
                    agent_id: agentId,
                    email,
                    password_hash: passwordHash,
                    name: `${agentData.first_name || ''} ${agentData.last_name || ''}`.trim() || 'Agent',
                    role: 'agent',
                    is_active: agentData.is_active !== undefined ? agentData.is_active : true,
                    created_at: new Date(),
                    updated_at: new Date()
                });
            }

            return await this.getAgentById(agentId, trx);
        });
    }

    /**
     * Get agent by ID
     * @param {number} id 
     * @param {Object} [trx] 
     * @returns {Promise<Object>}
     */
    async getAgentById(id, trx = knex) {
        return await trx('agents')
            .leftJoin('users', 'agents.id', 'users.agent_id')
            .select('agents.*', 'users.email')
            .where('agents.id', id)
            .first();
    }

    /**
     * Update agent data
     * @param {number} id 
     * @param {Object} data 
     * @returns {Promise<Object>}
     */
    async updateAgent(id, data) {
        const { email, password, ...agentData } = data;

        return await knex.transaction(async (trx) => {
            // 1. Update agent profile
            if (Object.keys(agentData).length > 0) {
                await trx('agents').where('id', id).update({
                    ...agentData,
                    updated_at: new Date()
                });
            }

            // 2. Update user account
            const userUpdate = {};
            if (email) userUpdate.email = email;
            if (password) userUpdate.password_hash = await bcrypt.hash(password, 10);
            if (agentData.is_active !== undefined) userUpdate.is_active = agentData.is_active;

            if (Object.keys(userUpdate).length > 0) {
                const existingUser = await trx('users').where('agent_id', id).first();
                if (existingUser) {
                    await trx('users').where('agent_id', id).update({
                        ...userUpdate,
                        updated_at: new Date()
                    });
                } else if (email) {
                    // Create if didn't exist but email provided
                    const passwordHash = password ? await bcrypt.hash(password, 10) : await bcrypt.hash('agent123', 10);
                    await trx('users').insert({
                        agent_id: id,
                        email,
                        password_hash: passwordHash,
                        name: `${agentData.first_name || ''} ${agentData.last_name || ''}`.trim() || 'Agent',
                        role: 'agent',
                        is_active: agentData.is_active !== undefined ? agentData.is_active : true,
                        created_at: new Date(),
                        updated_at: new Date()
                    });
                }
            }

            return await this.getAgentById(id, trx);
        });
    }
}

module.exports = new AgentService();

