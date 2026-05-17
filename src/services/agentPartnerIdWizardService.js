const knex = require('../config/database');
const projectService = require('./projectService');
const {
    parsePartnerAgentIdFromInput,
    assertPartnerAgentIdAvailable,
} = require('../utils/partnerAgentId');
const { parseProjectSettings, getPartnerAgentIdSettings } = require('../utils/projectSettings');

async function loadAgentWithParent(agentId, projectId, trx = knex) {
    const agent = await trx('agents').where({ id: agentId, project_id: projectId }).first();
    if (!agent) return { agent: null, parentAgent: null };

    let parentAgent = null;
    if (agent.parent_agent_id != null) {
        parentAgent = await trx('agents')
            .where({ id: agent.parent_agent_id, project_id: projectId })
            .select('id', 'partner_agent_id', 'first_name', 'last_name')
            .first();
    }

    return { agent, parentAgent };
}

/**
 * @param {number} agentId
 * @param {number} projectId
 * @param {{ action: 'set'|'skip', partner_agent_id?: string, partner_ref_url?: string }} input
 */
async function completePartnerIdWizard(agentId, projectId, input) {
    const { agent, parentAgent } = await loadAgentWithParent(agentId, projectId);
    if (!agent) {
        throw { status: 404, message: 'Agent not found' };
    }

    const project = await projectService.getProjectById(projectId);
    const settings = parseProjectSettings(project?.settings);
    const partnerCfg = getPartnerAgentIdSettings(settings);

    if (input.action === 'skip') {
        if (agent.parent_agent_id == null) {
            throw {
                status: 400,
                message: 'Пропуск доступен только агентам, зарегистрированным по приглашению куратора',
            };
        }
        const parentFinamId =
            parentAgent?.partner_agent_id != null &&
            String(parentAgent.partner_agent_id).trim() !== ''
                ? String(parentAgent.partner_agent_id).trim()
                : null;
        if (!parentFinamId) {
            throw {
                status: 400,
                message: 'У пригласившего агента не указан Finam ID — введите свой ID или дождитесь заполнения куратором',
            };
        }

        await knex('agents').where({ id: agentId, project_id: projectId }).update({
            inherit_parent_partner_agent_id: true,
            updated_at: new Date(),
        });

        return {
            action: 'skip',
            inherit_parent_partner_agent_id: true,
            effective_partner_agent_id: parentFinamId,
            partner_agent_id_mode: 'parent_inherited',
            partner_agent_id_label: partnerCfg.label || 'ID партнёра',
        };
    }

    if (input.action === 'set') {
        const nextId = parsePartnerAgentIdFromInput(
            {
                partner_agent_id: input.partner_agent_id,
                partner_ref_url: input.partner_ref_url,
            },
            settings
        );
        if (!nextId) {
            throw {
                status: 400,
                message: 'Укажите ID партнёра или ссылку из личного кабинета партнёра',
            };
        }

        await assertPartnerAgentIdAvailable(projectId, nextId, agentId);

        const source = input.partner_ref_url ? 'registration_ref' : 'admin';

        await knex('agents').where({ id: agentId, project_id: projectId }).update({
            partner_agent_id: nextId,
            partner_agent_id_source: source,
            inherit_parent_partner_agent_id: false,
            updated_at: new Date(),
        });

        return {
            action: 'set',
            partner_agent_id: nextId,
            inherit_parent_partner_agent_id: false,
            effective_partner_agent_id: nextId,
            partner_agent_id_mode: 'own',
            partner_agent_id_label: partnerCfg.label || 'ID партнёра',
        };
    }

    throw { status: 400, message: 'action must be set or skip' };
}

module.exports = {
    loadAgentWithParent,
    completePartnerIdWizard,
};
