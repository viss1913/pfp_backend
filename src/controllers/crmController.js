const crmService = require('../services/crmService');

class CrmController {
    async getDailyBriefing(req, res) {
        try {
            const agentId = req.user.id; // Assuming auth middleware sets req.user
            const briefing = await crmService.generateDailyBriefing(agentId);
            res.json({ briefing });
        } catch (error) {
            res.status(500).json({ error: 'Failed to generate briefing' });
        }
    }

    async updateClientStatus(req, res) {
        try {
            const { client_id, crm_status, notes } = req.body;
            if (!client_id || !crm_status) {
                return res.status(400).json({ error: 'client_id and crm_status are required' });
            }

            const result = await crmService.updateClientStatus(client_id, crm_status, notes);
            res.json(result);
        } catch (error) {
            console.error('CRM Update Error:', error);
            res.status(500).json({ error: 'Failed to update status' });
        }
    }
}

module.exports = new CrmController();
