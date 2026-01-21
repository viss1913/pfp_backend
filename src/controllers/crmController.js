const crmService = require('../services/crmService');

class CrmController {
    async getDailyBriefing(req, res) {
        try {
            const agentId = req.user.id; // Assuming auth middleware sets req.user
            const briefing = await crmService.generateDailyBriefing(agentId);
            res.json({ briefing });
        } catch (error) {
            console.error('CRM Briefing Error:', error);
            res.status(500).json({ error: 'Failed to generate briefing' });
        }
    }
}

module.exports = new CrmController();
