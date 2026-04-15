const reportService = require('../services/reportService');
const reportPdfService = require('../services/reportPdfService');
const clientService = require('../services/clientService');
const {
    maybeCompressPdfBuffer,
    ensureClientReportPdfReady,
    getClientReportPdfCacheStatus,
} = require('../services/reportPdfStorageService');

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

/**
 * Настройки брендинга отчёта: из JWT агента; если нет (админ и т.п.) — агент с карточки клиента; иначе дефолты.
 * @param {object} user
 * @param {object} client
 * @returns {{ agentId?: number, brandingAgentId?: null }}
 */
function wantsReportHtmlDocument(req) {
    const inline = String(req.query.inline || '').toLowerCase();
    const format = String(req.query.format || '').toLowerCase();
    return inline === '1' || inline === 'true' || format === 'html';
}

function reportBrandingOpts(user, client) {
    const jwtAgentId =
        Number.isFinite(Number(user?.agentId)) && Number(user.agentId) > 0 ? Number(user.agentId) : null;
    const ownerAgentId =
        client?.agent_id != null && client.agent_id !== '' && Number.isFinite(Number(client.agent_id))
            ? Number(client.agent_id)
            : null;
    const settingsAgentId = jwtAgentId || ownerAgentId;
    if (settingsAgentId) {
        return { agentId: settingsAgentId };
    }
    return { brandingAgentId: null };
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
            const clientId = Number(req.params.clientId);
            const projectId = req.projectId || req.user?.projectId;

            if (!clientId || Number.isNaN(clientId)) {
                res.status(400).json({ error: 'Invalid clientId' });
                return;
            }

            const client = await ensureClientReportAccess({ user: req.user, clientId, projectId });

            const includeCover = req.query.includeCover !== '0' && req.query.includeCover !== 'false';
            const includeSummary = req.query.includeSummary !== '0' && req.query.includeSummary !== 'false';
            const goalTypes = req.query.goalTypes || null;

            const pdfBuffer = await reportPdfService.generateClientReportPdf({
                clientId,
                projectId,
                includeCover,
                includeSummary,
                goalTypes,
                ...reportBrandingOpts(req.user, client),
            });
            const finalPdf = (await maybeCompressPdfBuffer(pdfBuffer)).buffer;

            const useAttachment = String(req.query.disposition || '').toLowerCase() === 'attachment';
            const ts = new Date().toISOString().slice(0, 10);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader(
                'Content-Disposition',
                `${useAttachment ? 'attachment' : 'inline'}; filename="report-client-${clientId}-${ts}.pdf"`
            );
            res.setHeader('Cache-Control', 'private, no-store');
            res.send(finalPdf);
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
            const clientId = Number(req.params.clientId);
            const projectId = req.projectId || req.user?.projectId;

            if (!clientId || Number.isNaN(clientId)) {
                res.status(400).json({ error: 'Invalid clientId' });
                return;
            }

            const client = await ensureClientReportAccess({ user: req.user, clientId, projectId });

            const includeCover = req.query.includeCover !== '0' && req.query.includeCover !== 'false';
            const includeSummary = req.query.includeSummary !== '0' && req.query.includeSummary !== 'false';
            const goalTypes = req.query.goalTypes || null;

            const { mergedHtml, pageHtmlList, toc } = await reportPdfService.generateClientReportHtmlPackage({
                clientId,
                projectId,
                includeCover,
                includeSummary,
                goalTypes,
                ...reportBrandingOpts(req.user, client),
            });

            if (wantsReportHtmlDocument(req)) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.setHeader('Cache-Control', 'private, no-store');
                res.send(mergedHtml);
                return;
            }

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
            const clientId = Number(req.params.clientId);
            const projectId = req.projectId || req.user?.projectId;

            if (!clientId || Number.isNaN(clientId)) {
                res.status(400).json({ error: 'Invalid clientId' });
                return;
            }

            const client = await ensureClientReportAccess({ user: req.user, clientId, projectId });

            const includeCover = req.query.includeCover !== '0' && req.query.includeCover !== 'false';
            const includeSummary = req.query.includeSummary !== '0' && req.query.includeSummary !== 'false';
            const goalTypes = req.query.goalTypes || null;

            const cacheState = await getClientReportPdfCacheStatus({ clientId, projectId });
            if (cacheState.status === 'ready' && cacheState.pdfUrl) {
                res.json({
                    status: 'ready',
                    pdf_url: cacheState.pdfUrl,
                    toc: [],
                    compressed: true,
                    generated_at: cacheState.generatedAt || new Date().toISOString(),
                });
                return;
            }

            const uploadRes = await ensureClientReportPdfReady({
                clientId,
                projectId,
                includeCover,
                includeSummary,
                goalTypes,
                ...reportBrandingOpts(req.user, client),
                fileNamePrefix: 'report',
                forceRegenerate: false,
                waitForResult: false,
            });

            if (uploadRes.status !== 'ready') {
                return res.status(202).json({
                    status: 'processing',
                    pdf_url: uploadRes.pdfUrl || null,
                    compressed: !!uploadRes.compressed,
                    generated_at: uploadRes.generatedAt || null,
                });
            }

            res.json({
                status: 'ready',
                pdf_url: uploadRes.pdfUrl,
                toc: Array.isArray(uploadRes.toc) ? uploadRes.toc : [],
                compressed: !!uploadRes.compressed,
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
