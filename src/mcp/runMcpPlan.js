const fs = require('fs');
const path = require('path');
const calculationService = require('../services/calculationService');
const clientService = require('../services/clientService');
const reportPdfService = require('../services/reportPdfService');
const { syncCalculationGoalsWithDatabase } = require('../services/clientGoalSyncService');
const { buildMcpPlanRequest } = require('./buildMcpPlanRequest');
const { presentPlan } = require('./presentPlan');

const PDF_DIR = path.resolve(__dirname, '../../tmp/mcp-plans');

async function persistPlan(body, calculationResponse, projectId) {
    const calculation = calculationResponse.calculation || calculationResponse;
    const clientId = await clientService.createFullClient(body);
    await syncCalculationGoalsWithDatabase(clientId, calculation);
    await clientService.persistGoalsSummary(clientId, calculationResponse, projectId);
    return clientId;
}

/**
 * Считает план, собирает карточки для презентации и пишет PDF на диск.
 * @param {object} input
 * @param {number} projectId
 */
async function runMcpPlan(input, projectId) {
    const pid = Number(projectId);
    if (!Number.isFinite(pid) || pid <= 0) {
        return { ok: false, ask_next: ['Не задан проект расчёта (PFP_MCP_PROJECT_ID).'] };
    }

    const built = buildMcpPlanRequest(input, pid);
    if (!built.ok) return built;

    let calculation;
    try {
        calculation = await calculationService.calculateFirstRun(built.body, null, null, {
            isFirstRun: true,
            usePool: true,
        });
    } catch (err) {
        return { ok: false, error: err.message || 'Расчёт не выполнился.' };
    }

    const presentation = presentPlan(calculation, input);
    let clientId = null;
    let pdfPath = null;
    let pdfError = null;

    try {
        clientId = await persistPlan(built.body, calculation, pid);
        fs.mkdirSync(PDF_DIR, { recursive: true });
        const pdfBuffer = await reportPdfService.generateClientReportPdf({
            clientId,
            projectId: pid,
            agentId: null,
            brandingAgentId: null,
            includeCover: true,
            includeSummary: true,
        });
        pdfPath = path.join(PDF_DIR, `plan-${clientId}.pdf`);
        fs.writeFileSync(pdfPath, pdfBuffer);
    } catch (err) {
        pdfError = err.message || 'PDF не собрался.';
    }

    return {
        ok: true,
        session_id: String(input?.session_id || '').trim() || null,
        client_id: clientId,
        pdf_path: pdfPath,
        pdf_error: pdfError,
        presentation,
    };
}

module.exports = { runMcpPlan, PDF_DIR };
