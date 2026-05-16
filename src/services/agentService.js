const knex = require('../config/database');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const smmService = require('./smmService');
const projectService = require('./projectService');
const { withNormalizedBirthDate } = require('../utils/normalizeMysqlDate');
const {
    parsePartnerAgentIdFromInput,
    isPartnerAgentIdRequired,
    assertPartnerAgentIdAvailable,
} = require('../utils/partnerAgentId');
const { parseProjectSettings } = require('../utils/projectSettings');
const agentNetworkService = require('./agentNetworkService');

const AGENT_STRIP_KEYS = new Set([
    'email',
    'password',
    'partner_ref_url',
    'ref',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term',
]);

function splitAgentPayload(data = {}) {
    const { email, password, partner_ref_url, ref, ...rest } = data;
    const profile = {};
    for (const [key, value] of Object.entries(rest)) {
        if (!AGENT_STRIP_KEYS.has(key)) profile[key] = value;
    }
    return {
        email,
        password,
        partner_ref_url,
        ref,
        profile: withNormalizedBirthDate(profile),
    };
}

async function resolveProjectSettings(projectId) {
    const project = await projectService.getProjectById(projectId);
    return parseProjectSettings(project?.settings);
}

class AgentService {
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

    async createAgent(projectId, data) {
        const { email, password, partner_ref_url, profile } = splitAgentPayload(data);
        const settings = await resolveProjectSettings(projectId);

        let partnerAgentId = null;
        let partnerSource = null;
        if (profile.partner_agent_id != null || partner_ref_url) {
            partnerAgentId = parsePartnerAgentIdFromInput(
                { partner_agent_id: profile.partner_agent_id, partner_ref_url },
                settings
            );
            partnerSource = partner_ref_url ? 'registration_ref' : 'admin';
        } else if (isPartnerAgentIdRequired(settings, 'admin_create')) {
            throw { status: 400, message: 'Требуется ID партнёра (partner_agent_id)' };
        }
        delete profile.partner_agent_id;

        if (partnerAgentId) {
            await assertPartnerAgentIdAvailable(projectId, partnerAgentId);
        }

        if (profile.parent_agent_id != null) {
            await agentNetworkService.assertValidParentAssignment({
                agentId: null,
                parentAgentId: profile.parent_agent_id,
                projectSettings: settings,
            });
        }

        return await knex.transaction(async (trx) => {
            const slug = await agentNetworkService.generateReferralSlug();
            const [id] = await trx('agents').insert({
                ...profile,
                project_id: projectId,
                uuid: crypto.randomUUID(),
                partner_agent_id: partnerAgentId,
                partner_agent_id_source: partnerAgentId ? partnerSource : null,
                referral_slug: slug,
                is_active: profile.is_active !== undefined ? profile.is_active : true,
                created_at: new Date(),
                updated_at: new Date(),
            });

            const agentId = typeof id === 'object' ? id.id : id;

            if (email) {
                if (!password && !process.env.DEFAULT_AGENT_PASSWORD) {
                    throw {
                        status: 500,
                        message: 'Server configuration error: DEFAULT_AGENT_PASSWORD is not set',
                    };
                }
                const passwordHash = password
                    ? await bcrypt.hash(password, 10)
                    : await bcrypt.hash(process.env.DEFAULT_AGENT_PASSWORD, 10);
                await trx('users').insert({
                    agent_id: agentId,
                    project_id: projectId,
                    email,
                    password_hash: passwordHash,
                    name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Agent',
                    role: 'agent',
                    is_active: profile.is_active !== undefined ? profile.is_active : true,
                    created_at: new Date(),
                    updated_at: new Date(),
                });
            }

            const result = await this.getAgentById(agentId, projectId, trx);
            smmService.syncAgent(agentId).catch((err) => console.error('Initial SMM sync failed:', err));
            return result;
        });
    }

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

    async updateAgent(id, projectId, data) {
        const { email, password, partner_ref_url, profile } = splitAgentPayload(data);
        const settings = await resolveProjectSettings(projectId);

        if (profile.partner_agent_id !== undefined || partner_ref_url) {
            const nextId = parsePartnerAgentIdFromInput(
                {
                    partner_agent_id: profile.partner_agent_id,
                    partner_ref_url,
                },
                settings
            );
            if (nextId) {
                await assertPartnerAgentIdAvailable(projectId, nextId, id);
                profile.partner_agent_id = nextId;
                profile.partner_agent_id_source = partner_ref_url ? 'registration_ref' : 'admin';
            } else if (profile.partner_agent_id === null || profile.partner_agent_id === '') {
                profile.partner_agent_id = null;
                profile.partner_agent_id_source = null;
            }
        }

        if (profile.parent_agent_id !== undefined) {
            await agentNetworkService.assertValidParentAssignment({
                agentId: id,
                parentAgentId: profile.parent_agent_id,
                projectSettings: settings,
            });
        }

        return await knex.transaction(async (trx) => {
            const existingAgent = await this.getAgentById(id, projectId, trx);
            if (!existingAgent) {
                throw { status: 404, message: 'Agent not found' };
            }

            if (Object.keys(profile).length > 0) {
                await trx('agents').where({ id, project_id: projectId }).update({
                    ...profile,
                    updated_at: new Date(),
                });
            }

            const userUpdate = {};
            if (email) userUpdate.email = email;
            if (password) userUpdate.password_hash = await bcrypt.hash(password, 10);
            if (profile.is_active !== undefined) userUpdate.is_active = profile.is_active;

            if (Object.keys(userUpdate).length > 0) {
                const existingUser = await trx('users').where({ agent_id: id, project_id: projectId }).first();
                if (existingUser) {
                    await trx('users').where({ agent_id: id, project_id: projectId }).update({
                        ...userUpdate,
                        updated_at: new Date(),
                    });
                } else if (email) {
                    if (!password && !process.env.DEFAULT_AGENT_PASSWORD) {
                        throw {
                            status: 500,
                            message: 'Server configuration error: DEFAULT_AGENT_PASSWORD is not set',
                        };
                    }
                    const passwordHash = password
                        ? await bcrypt.hash(password, 10)
                        : await bcrypt.hash(process.env.DEFAULT_AGENT_PASSWORD, 10);
                    await trx('users').insert({
                        agent_id: id,
                        project_id: projectId,
                        email,
                        password_hash: passwordHash,
                        name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Agent',
                        role: 'agent',
                        is_active: profile.is_active !== undefined ? profile.is_active : true,
                        created_at: new Date(),
                        updated_at: new Date(),
                    });
                }
            }

            if (!existingAgent.referral_slug) {
                await agentNetworkService.ensureReferralSlug(id, trx);
            }

            const result = await this.getAgentById(id, projectId, trx);
            smmService.syncAgent(id).catch((err) => console.error('SMM sync update failed:', err));
            return result;
        });
    }
}

module.exports = new AgentService();
