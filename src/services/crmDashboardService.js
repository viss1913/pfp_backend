const clientService = require('./clientService');
const { buildCrmAgentDashboard } = require('../utils/goalsSummaryMetrics');

/**
 * @param {number} agentId
 * @param {number|null} projectId
 * @param {{ includeClients?: boolean }} [options]
 */
async function getAgentDashboard(agentId, projectId, options = {}) {
    const result = await clientService.getClientsByAgent(agentId, projectId, { limit: null });
    const clients = (result.data || []).map((row) => ({
        id: row.id,
        created_at: row.created_at,
        updated_at: row.updated_at,
        goals_summary: row.goals_summary,
        first_name: row.first_name,
        last_name: row.last_name,
    }));

    return buildCrmAgentDashboard(clients, {
        includeClients: options.includeClients === true,
    });
}

module.exports = {
    getAgentDashboard,
};
