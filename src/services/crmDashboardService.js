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

    if (options.includeClients === true && Array.isArray(dashboard.clients)) {
        const byClientId = new Map(
            (forecast.clients || []).map((row) => [Number(row.client_id), row])
        );
        dashboard.clients = dashboard.clients.map((row) => {
            const fc = byClientId.get(Number(row.id));
            if (!fc) {
                return {
                    ...row,
                    commission_year_1_rub: 0,
                    commission_total_rub: 0,
                };
            }
            return {
                ...row,
                commission_year_1_rub: fc.commission_year_1_rub,
                commission_total_rub: fc.commission_total_rub,
            };
        });
    }

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
    const payload = {
        commission_year_1_rub: forecast.commission_year_1_rub,
        commission_total_rub: forecast.commission_total_rub,
        commission_by_product: forecast.commission_by_product,
        series: forecast.series,
        as_of: forecast.as_of,
    };

    if (options.includeClients === true) {
        payload.clients = (forecast.clients || []).map((row) => ({
            id: row.client_id,
            commission_year_1_rub: row.commission_year_1_rub,
            commission_total_rub: row.commission_total_rub,
            commission_by_product: row.commission_by_product,
        }));
    }

    return payload;
}

module.exports = {
    getAgentDashboard,
    getAgentCommissionForecast,
};
