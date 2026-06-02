const test = require('node:test');
const assert = require('node:assert/strict');

const clientService = require('../../src/services/clientService');
const commissionForecastService = require('../../src/services/commissionForecastService');
const crmDashboardService = require('../../src/services/crmDashboardService');

test('getAgentDashboard enriches response with commission forecast fields', async () => {
    const originalGetClientsByAgent = clientService.getClientsByAgent;
    const originalBuildForecast = commissionForecastService.buildAgentsCommissionForecast;

    clientService.getClientsByAgent = async () => ({
        data: [
            {
                id: 1,
                created_at: '2026-01-01T00:00:00.000Z',
                updated_at: '2026-01-01T00:00:00.000Z',
                goals_summary: null,
                first_name: 'A',
                last_name: 'B',
            },
        ],
    });
    commissionForecastService.buildAgentsCommissionForecast = async () => ({
        commission_year_1_rub: 1234.56,
        commission_total_rub: 7890.12,
        commission_by_product: [
            {
                product_id: 42,
                name: 'Test product',
                product_type: 'LIFE',
                commission_year_1_rub: 1000,
                commission_total_rub: 5000,
            },
        ],
    });

    try {
        const dashboard = await crmDashboardService.getAgentDashboard(10, 14, { includeClients: true });
        assert.equal(dashboard.commission_year_1_rub, 1234.56);
        assert.equal(dashboard.commission_total_rub, 7890.12);
        assert.equal(dashboard.commission_by_product.length, 1);
    } finally {
        clientService.getClientsByAgent = originalGetClientsByAgent;
        commissionForecastService.buildAgentsCommissionForecast = originalBuildForecast;
    }
});

