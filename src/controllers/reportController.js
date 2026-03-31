const reportService = require('../services/reportService');
const reportPdfService = require('../services/reportPdfService');

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

    async getClientReportPdf(req, res) {
        try {
            const agentId = req.user.agentId;
            const clientId = Number(req.params.clientId);
            const projectId = req.projectId || req.user?.projectId;

            if (!clientId || Number.isNaN(clientId)) {
                res.status(400).json({ error: 'Invalid clientId' });
                return;
            }

            const includeCover = req.query.includeCover !== '0' && req.query.includeCover !== 'false';
            const includeSummary = req.query.includeSummary !== '0' && req.query.includeSummary !== 'false';
            const goalTypes = req.query.goalTypes || null;

            const pdfBuffer = await reportPdfService.generateClientReportPdf({
                clientId,
                agentId,
                projectId,
                includeCover,
                includeSummary,
                goalTypes,
            });

            const useAttachment = String(req.query.disposition || '').toLowerCase() === 'attachment';
            const ts = new Date().toISOString().slice(0, 10);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader(
                'Content-Disposition',
                `${useAttachment ? 'attachment' : 'inline'}; filename="report-client-${clientId}-${ts}.pdf"`
            );
            res.setHeader('Cache-Control', 'private, no-store');
            res.send(pdfBuffer);
        } catch (error) {
            console.error('Report PDF Generation Error:', error);
            res.status(500).json({ error: error.message || 'Failed to generate PDF report' });
        }
    }
}

module.exports = new ReportController();
