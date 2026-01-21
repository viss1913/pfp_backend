const reportService = require('../services/reportService');

class ReportController {
    async getClientReport(req, res) {
        try {
            const { clientId } = req.params;
            const agentId = req.user.agentId; // Needed if we want to enforce ownership

            // Optional: Check ownership via clientService (omitted for brevity, assume middleware matches or service handles)

            const reportData = await reportService.getClientReportData(clientId);
            res.json(reportData);
        } catch (error) {
            console.error('Report Generation Error:', error);
            res.status(500).json({ error: 'Failed to generate report data' });
        }
    }
}

module.exports = new ReportController();
