const knex = require('../config/database');
const projectService = require('./projectService');
const { parseProjectSettings, getAgentNetworkSettings } = require('../utils/projectSettings');
const { aggregateClientsMetrics, buildNetworkSummary } = require('../utils/goalsSummaryMetrics');

async function assertAgentNetworkEnabled(projectId) {
    const project = await projectService.getProjectById(projectId);
    const settings = parseProjectSettings(project?.settings);
    const network = getAgentNetworkSettings(settings);
    if (network.enabled !== true) {
        throw {
            status: 403,
            message: 'Агентская сеть отключена для этого проекта',
        };
    }
    return settings;
}

/**
 * @param {number} parentAgentId
 * @param {number} projectId
 */
async function getSubagentDashboard(parentAgentId, projectId) {
    await assertAgentNetworkEnabled(projectId);

    const subagents = await knex('agents')
        .leftJoin('users', 'agents.id', 'users.agent_id')
        .where('agents.project_id', projectId)
        .where('agents.parent_agent_id', parentAgentId)
        .select(
            'agents.id',
            'agents.uuid',
            'agents.first_name',
            'agents.last_name',
            'agents.partner_agent_id',
            'agents.referral_slug',
            'agents.is_active',
            'agents.created_at',
            'users.email'
        )
        .orderBy('agents.created_at', 'desc');

    const subagentIds = subagents.map((a) => a.id);
    let clientsByAgent = {};

    if (subagentIds.length) {
        const clientRows = await knex('clients')
            .whereIn('agent_id', subagentIds)
            .select(
                'id',
                'agent_id',
                'goals_summary',
                'crm_status',
                'created_at',
                'updated_at'
            );

        for (const row of clientRows) {
            const aid = row.agent_id;
            if (!clientsByAgent[aid]) clientsByAgent[aid] = [];
            clientsByAgent[aid].push(row);
        }
    }

    const data = subagents.map((agent) => {
        const clients = clientsByAgent[agent.id] || [];
        const metrics = aggregateClientsMetrics(clients);
        return {
            id: agent.id,
            uuid: agent.uuid,
            first_name: agent.first_name,
            last_name: agent.last_name,
            email: agent.email,
            partner_agent_id: agent.partner_agent_id,
            referral_slug: agent.referral_slug,
            is_active: agent.is_active,
            created_at: agent.created_at,
            metrics,
        };
    });

    return {
        enabled: true,
        summary: buildNetworkSummary(data),
        data,
    };
}

module.exports = {
    assertAgentNetworkEnabled,
    getSubagentDashboard,
};
