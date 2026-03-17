const knex = require('../config/database');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const smmService = require('./smmService');

class AgentService {
    /**
     * Get all agents for synchronization
     * @param {Object} filters 
     * @returns {Promise<Array>}
     */
    async getAllAgentsForSync(projectId = null, filters = {}) {
        const query = knex('agents')
            .leftJoin('users', 'agents.id', 'users.agent_id')
            .select('agents.*', 'users.email');

        if (projectId) {
            query.where('agents.project_id', projectId);
        }

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
    async createAgent(projectId, data) {
        const { email, password, ...agentData } = data;

        return await knex.transaction(async (trx) => {
            // 1. Create agent profile
            const [id] = await trx('agents').insert({
                ...agentData,
                project_id: projectId,
                uuid: crypto.randomUUID(), // Generate universal UUID
                created_at: new Date(),
                updated_at: new Date()
            });

            const agentId = typeof id === 'object' ? id.id : id;

            // 2. Create user account if email/password provided
            if (email) {
                if (!password && !process.env.DEFAULT_AGENT_PASSWORD) {
                    throw { status: 500, message: 'Server configuration error: DEFAULT_AGENT_PASSWORD is not set' };
                }
                const passwordHash = password ? await bcrypt.hash(password, 10) : await bcrypt.hash(process.env.DEFAULT_AGENT_PASSWORD, 10);
                await trx('users').insert({
                    agent_id: agentId,
                    project_id: projectId,
                    email,
                    password_hash: passwordHash,
                    name: `${agentData.first_name || ''} ${agentData.last_name || ''}`.trim() || 'Agent',
                    role: 'agent',
                    is_active: agentData.is_active !== undefined ? agentData.is_active : true,
                    created_at: new Date(),
                    updated_at: new Date()
                });
            }

            const result = await this.getAgentById(agentId, projectId, trx);

            // 3. Sync with SMM (async, don't wait to not block the main flow)
            smmService.syncAgent(agentId).catch(err => console.error('Initial SMM sync failed:', err));

            return result;
        });
    }

    /**
     * Get agent by ID
     * @param {number} id 
     * @param {number} [projectId]
     * @param {Object} [trx] 
     * @returns {Promise<Object>}
     */
    async getAgentById(id, projectId = null, trx = knex) {
        let query = trx('agents')
            .leftJoin('users', 'agents.id', 'users.agent_id')
            .select('agents.*', 'users.email')
            .where('agents.id', id);

        if (projectId) {
            query.where('agents.project_id', projectId);
        }

        return await query.first();
    }

    /**
     * Update agent data
     * @param {number} id 
     * @param {Object} data 
     * @returns {Promise<Object>}
     */
    async updateAgent(id, projectId, data) {
        const { email, password, ...agentData } = data;

        return await knex.transaction(async (trx) => {
            // Check if agent exists and belongs to project
            const existingAgent = await this.getAgentById(id, projectId, trx);
            if (!existingAgent) {
                throw { status: 404, message: 'Agent not found' };
            }

            // 1. Update agent profile
            if (Object.keys(agentData).length > 0) {
                await trx('agents').where({ id, project_id: projectId }).update({
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
                const existingUser = await trx('users').where({ agent_id: id, project_id: projectId }).first();
                if (existingUser) {
                    await trx('users').where({ agent_id: id, project_id: projectId }).update({
                        ...userUpdate,
                        updated_at: new Date()
                    });
                } else if (email) {
                    // Create if didn't exist but email provided
                    if (!password && !process.env.DEFAULT_AGENT_PASSWORD) {
                        throw { status: 500, message: 'Server configuration error: DEFAULT_AGENT_PASSWORD is not set' };
                    }
                    const passwordHash = password ? await bcrypt.hash(password, 10) : await bcrypt.hash(process.env.DEFAULT_AGENT_PASSWORD, 10);
                    await trx('users').insert({
                        agent_id: id,
                        project_id: projectId,
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

            const result = await this.getAgentById(id, projectId, trx);

            // 3. Sync with SMM (async, don't wait)
            smmService.syncAgent(id).catch(err => console.error('SMM sync update failed:', err));

            return result;
        });
    }
}

module.exports = new AgentService();

