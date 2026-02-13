const reportService = require('../services/reportService');

class ReportController {
    async getClientReport(req, res) {
        try {
            const agentId = req.user.agentId;
            const clientId = req.params.clientId; // Assuming clientId comes from URL parameters
            const projectId = req.projectId || req.user?.projectId;

            const reportData = await reportService.getClientReportData(clientId, projectId);
            res.json(reportData);
        } catch (error) {
            console.error('Report Generation Error:', error);
            res.status(500).json({ error: 'Failed to generate report data' });
        }
    }
}

module.exports = new ReportController();
