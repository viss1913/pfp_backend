const clientService = require('./clientService');
const { buildCrmAgentDashboard } = require('../utils/goalsSummaryMetrics');
const commissionForecastService = require('./commissionForecastService');

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

    const dashboard = buildCrmAgentDashboard(clients, {
        includeClients: options.includeClients === true,
    });

    const forecast = await commissionForecastService.buildAgentsCommissionForecast(clients, projectId);
    dashboard.commission_year_1_rub = forecast.commission_year_1_rub;
    dashboard.commission_total_rub = forecast.commission_total_rub;
    dashboard.commission_by_product = forecast.commission_by_product;

    return dashboard;
}

async function getAgentCommissionForecast(agentId, projectId, options = {}) {
    const result = await clientService.getClientsByAgent(agentId, projectId, { limit: null });
    let clients = (result.data || []).map((row) => ({
        id: row.id,
        goals_summary: row.goals_summary,
    }));

    const filterClientId = options.clientId != null ? Number(options.clientId) : null;
    if (Number.isFinite(filterClientId) && filterClientId > 0) {
        clients = clients.filter((row) => Number(row.id) === filterClientId);
    }

    const forecast = await commissionForecastService.buildAgentsCommissionForecast(clients, projectId);
    return {
        commission_year_1_rub: forecast.commission_year_1_rub,
        commission_total_rub: forecast.commission_total_rub,
        commission_by_product: forecast.commission_by_product,
        series: forecast.series,
        as_of: forecast.as_of,
    };
}

module.exports = {
    getAgentDashboard,
    getAgentCommissionForecast,
};
