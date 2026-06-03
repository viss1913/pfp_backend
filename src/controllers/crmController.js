const crmService = require('../services/crmService');
const crmDashboardService = require('../services/crmDashboardService');

class CrmController {
    async getDailyBriefing(req, res) {
        try {
            const agentId = req.user.agentId || req.user.id;
            const projectId = req.projectId || req.user?.projectId || null;
            const agentContext = {
                name: req.user?.name,
                email: req.user?.email,
            };
            const [briefing, attention] = await Promise.all([
                crmService.generateDailyBriefing(agentId, agentContext, projectId),
                crmService.countAttentionClients(agentId, projectId),
            ]);
            res.json({
                briefing,
                clients_attention_count: attention.clients_attention_count,
                critical_events_count: attention.critical_events_count,
            });
        } catch (error) {
            console.error('CRM Briefing Error:', error);
            res.status(500).json({ error: 'Failed to generate briefing' });
        }
    }

    async getDashboard(req, res, next) {
        try {
            const agentId = req.user.agentId || req.user.id;
            if (!agentId) {
                return res.status(400).json({ error: 'Agent ID not found in token' });
            }
            const projectId = req.projectId || req.user?.projectId || null;
            const includeClients =
                req.query.include_clients === '1' || req.query.include_clients === 'true';
            const dashboard = await crmDashboardService.getAgentDashboard(agentId, projectId, {
                includeClients,
            });
            res.json(dashboard);
        } catch (error) {
            next(error);
        }
    }

    async getCommissionForecast(req, res, next) {
        try {
            const agentId = req.user.agentId || req.user.id;
            if (!agentId) {
                return res.status(400).json({ error: 'Agent ID not found in token' });
            }
            const projectId = req.projectId || req.user?.projectId || null;
            const includeClients =
                req.query.include_clients === '1' || req.query.include_clients === 'true';
            const dashboard = await crmDashboardService.getAgentCommissionForecast(agentId, projectId, {
                clientId: req.query.client_id,
                includeClients,
            });
            res.json(dashboard);
        } catch (error) {
            next(error);
        }
    }

    async updateClientStatus(req, res) {
        try {
            const { client_id, crm_status, notes } = req.body;
            const projectId = req.projectId || req.user?.projectId;

            if (!client_id || !crm_status) {
                return res.status(400).json({ error: 'client_id and crm_status are required' });
            }

            const result = await crmService.updateClientStatus(client_id, crm_status, notes, projectId);
            res.json(result);
        } catch (error) {
            console.error('CRM Update Error:', error);
            res.status(500).json({ error: 'Failed to update status' });
        }
    }
}

module.exports = new CrmController();
