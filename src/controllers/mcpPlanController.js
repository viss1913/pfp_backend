const fs = require('fs');
const path = require('path');
const { MCP_GOAL_CATALOG, MCP_INTERVIEW } = require('../mcp/goalCatalog');
const { runMcpPlan, PDF_DIR } = require('../mcp/runMcpPlan');
const reportPdfService = require('../services/reportPdfService');
const {
    signMcpPdfToken,
    verifyMcpPdfToken,
    buildMcpPdfUrl,
    requestApiBase,
} = require('../mcp/pdfLink');

class McpPlanController {
    catalog(req, res) {
        res.json({ interview: MCP_INTERVIEW, goals: MCP_GOAL_CATALOG });
    }

    async plan(req, res, next) {
        try {
            const projectId = req.projectId || req.user?.projectId;
            if (!projectId) {
                return res.status(400).json({ ok: false, error: 'Нужен заголовок X-Project-Key.' });
            }
            const result = await runMcpPlan(req.body || {}, projectId);
            if (!result.ok && result.ask_next) {
                return res.status(400).json(result);
            }
            if (!result.ok) {
                return res.status(422).json(result);
            }
            const token = result.client_id && !result.pdf_error
                ? signMcpPdfToken({ clientId: result.client_id, projectId })
                : null;
            result.pdf_url = buildMcpPdfUrl(token, requestApiBase(req));
            if (result.presentation && result.pdf_url) result.presentation.pdf_url = result.pdf_url;
            delete result.pdf_path;
            res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async pdf(req, res, next) {
        try {
            const { clientId, projectId } = verifyMcpPdfToken(req.query.t);
            const filePath = path.join(PDF_DIR, `plan-${clientId}.pdf`);
            if (!fs.existsSync(filePath)) {
                fs.mkdirSync(PDF_DIR, { recursive: true });
                const pdfBuffer = await reportPdfService.generateClientReportPdf({
                    clientId,
                    projectId,
                    agentId: null,
                    brandingAgentId: null,
                    includeCover: true,
                    includeSummary: true,
                });
                fs.writeFileSync(filePath, pdfBuffer);
            }
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="plan-${clientId}.pdf"`);
            res.setHeader('Cache-Control', 'private, no-store');
            fs.createReadStream(filePath).pipe(res);
        } catch (err) {
            if (err.statusCode) {
                return res.status(err.statusCode).json({ error: err.message });
            }
            next(err);
        }
    }
}

module.exports = new McpPlanController();
