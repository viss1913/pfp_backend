const reportService = require('../services/reportService');
const reportPdfService = require('../services/reportPdfService');
const clientService = require('../services/clientService');
const { uploadPublicFile } = require('../utils/r2Client');

async function ensureClientReportAccess({ user, clientId, projectId }) {
    const client = await clientService.getFullClient(clientId, projectId);
    if (!client) {
        const err = new Error('Client not found');
        err.statusCode = 404;
        throw err;
    }

    const role = String(user?.role || '').toLowerCase();
    const isAdmin = ['admin', 'super_admin'].includes(role);
    if (isAdmin) return client;

    if (role === 'client') {
        if (Number(user?.clientId) !== Number(clientId)) {
            const err = new Error('Access denied');
            err.statusCode = 403;
            throw err;
        }
        return client;
    }

    const requesterAgentId = Number(user?.agentId);
    const ownerAgentId = Number(client?.agent_id);
    if (!Number.isFinite(requesterAgentId) || requesterAgentId <= 0 || requesterAgentId !== ownerAgentId) {
        const err = new Error('Access denied');
        err.statusCode = 403;
        throw err;
    }

    return client;
}

class ReportController {
    async getClientReport(req, res) {
        try {
            const clientId = Number(req.params.clientId);
            const projectId = req.projectId || req.user?.projectId;
            if (!clientId || Number.isNaN(clientId)) {
                res.status(400).json({ error: 'Invalid clientId' });
                return;
            }

            await ensureClientReportAccess({ user: req.user, clientId, projectId });

            const reportData = await reportService.getClientReportData(clientId, projectId);
            res.json(reportData);
        } catch (error) {
            if (error?.statusCode) {
                res.status(error.statusCode).json({ error: error.message });
                return;
            }
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

            await ensureClientReportAccess({ user: req.user, clientId, projectId });

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
            if (error?.statusCode) {
                res.status(error.statusCode).json({ error: error.message });
                return;
            }
            console.error('Report PDF Generation Error:', error);
            res.status(500).json({ error: error.message || 'Failed to generate PDF report' });
        }
    }

    async getClientReportHtml(req, res) {
        try {
            const agentId = req.user.agentId;
            const clientId = Number(req.params.clientId);
            const projectId = req.projectId || req.user?.projectId;

            if (!clientId || Number.isNaN(clientId)) {
                res.status(400).json({ error: 'Invalid clientId' });
                return;
            }

            await ensureClientReportAccess({ user: req.user, clientId, projectId });

            const includeCover = req.query.includeCover !== '0' && req.query.includeCover !== 'false';
            const includeSummary = req.query.includeSummary !== '0' && req.query.includeSummary !== 'false';
            const goalTypes = req.query.goalTypes || null;

            const { mergedHtml, pageHtmlList, toc } = await reportPdfService.generateClientReportHtmlPackage({
                clientId,
                agentId,
                projectId,
                includeCover,
                includeSummary,
                goalTypes,
            });

            res.json({
                html: mergedHtml,
                pages: pageHtmlList,
                toc: Array.isArray(toc) ? toc : [],
                generated_at: new Date().toISOString(),
            });
        } catch (error) {
            if (error?.statusCode) {
                res.status(error.statusCode).json({ error: error.message });
                return;
            }
            console.error('Report HTML Generation Error:', error);
            res.status(500).json({ error: error.message || 'Failed to generate HTML report' });
        }
    }

    async getClientReportPdfUrl(req, res) {
        try {
            const agentId = req.user.agentId;
            const clientId = Number(req.params.clientId);
            const projectId = req.projectId || req.user?.projectId;

            if (!clientId || Number.isNaN(clientId)) {
                res.status(400).json({ error: 'Invalid clientId' });
                return;
            }

            await ensureClientReportAccess({ user: req.user, clientId, projectId });

            const includeCover = req.query.includeCover !== '0' && req.query.includeCover !== 'false';
            const includeSummary = req.query.includeSummary !== '0' && req.query.includeSummary !== 'false';
            const goalTypes = req.query.goalTypes || null;

            const { pdfBuffer, toc } = await reportPdfService.generateClientReportPdfPackage({
                clientId,
                agentId,
                projectId,
                includeCover,
                includeSummary,
                goalTypes,
            });

            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            const key = `pdf-reports/${projectId || 'no-project'}/${clientId}/report-${ts}.pdf`;
            const uploadResult = await uploadPublicFile({
                key,
                body: pdfBuffer,
                contentType: 'application/pdf',
            });

            if (!uploadResult?.ok || !uploadResult?.url) {
                const detail = uploadResult?.detail || uploadResult?.reason || 'Storage upload failed';
                return res.status(503).json({ error: 'Failed to upload generated PDF', detail });
            }

            res.json({
                pdf_url: uploadResult.url,
                toc: Array.isArray(toc) ? toc : [],
                generated_at: new Date().toISOString(),
            });
        } catch (error) {
            if (error?.statusCode) {
                res.status(error.statusCode).json({ error: error.message });
                return;
            }
            console.error('Report PDF URL Generation Error:', error);
            res.status(500).json({ error: error.message || 'Failed to generate report PDF URL' });
        }
    }
}

module.exports = new ReportController();
