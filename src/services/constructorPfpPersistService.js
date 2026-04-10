const knex = require('../config/database');
const clientService = require('./clientService');
const clientRepository = require('../repositories/clientRepository');
const reportPdfService = require('./reportPdfService');
const { uploadPublicFile } = require('../utils/r2Client');
const { syncCalculationGoalsWithDatabase } = require('./clientGoalSyncService');
const {
    signSiteChatReportPdfToken,
    buildSiteChatReportPdfUrl,
    getSiteChatReportPdfPublicBase,
} = require('./constructorSiteReportPdfTokenService');

function buildConstructorPfpSaveBody(extraction, bot, constructorNickname) {
    const extClient = { ...(extraction?.client || {}) };
    const nick = String(constructorNickname || '').trim();
    if (!extClient.fio && !extClient.first_name && nick) {
        extClient.first_name = nick.replace(/^@/, '').slice(0, 120) || ' ';
    }

    // client.assets — только для first-run math; в БД колонки clients.assets нет.
    // createFullClient / updateFullClient ждут data.assets на корне, иначе insert/update падает.
    const assetsFromClient = Array.isArray(extClient.assets) ? extClient.assets : [];
    delete extClient.assets;

    const client = {
        ...extClient,
        project_id: bot.project_id,
        agent_id: bot.agent_id,
    };

    const body = {
        client,
        goals: Array.isArray(extraction?.goals) ? extraction.goals : [],
    };
    if (assetsFromClient.length > 0) {
        body.assets = assetsFromClient;
    }
    return body;
}

/**
 * Сохраняет результат firstRun конструктора в clients/goals и связывает с constructor_clients.
 * @returns {{ clientId: number }}
 */
async function persistConstructorCalculationToPfpClient({
    constructorClientRow,
    bot,
    extraction,
    calculationResponse,
}) {
    if (!bot?.project_id) {
        throw new Error('Constructor bot has no project_id; cannot persist PFP client');
    }
    if (!bot?.agent_id) {
        throw new Error('Constructor bot has no agent_id; cannot set CRM owner');
    }

    const pfpBody = buildConstructorPfpSaveBody(extraction, bot, constructorClientRow?.nickname);
    const calculation = calculationResponse.calculation || calculationResponse;

    let clientId = constructorClientRow.pfp_client_id ? Number(constructorClientRow.pfp_client_id) : null;

    if (clientId) {
        const existing = await clientRepository.findById(clientId, bot.project_id);
        if (!existing) {
            console.warn(
                `[ConstructorPfpPersist] pfp_client_id ${clientId} not in project ${bot.project_id}; creating new client`
            );
            clientId = null;
        } else {
            await clientService.updateFullClient(clientId, pfpBody);
        }
    }

    if (!clientId) {
        clientId = await clientService.createFullClient(pfpBody);
    }

    await syncCalculationGoalsWithDatabase(clientId, calculation);

    await clientService.updateClient(clientId, {
        goals_summary: JSON.stringify(calculationResponse),
    });

    await knex('constructor_clients').where('id', constructorClientRow.id).update({
        pfp_client_id: clientId,
        updated_at: knex.fn.now(),
    });

    return { clientId };
}

async function uploadConstructorClientReportPdf({ clientId, agentId, projectId }) {
    const { pdfBuffer } = await reportPdfService.generateClientReportPdfPackage({
        clientId,
        agentId,
        projectId,
        includeCover: true,
        includeSummary: true,
        goalTypes: null,
    });

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const key = `pdf-reports/${projectId || 'no-project'}/${clientId}/constructor-report-${ts}.pdf`;
    const uploadResult = await uploadPublicFile({
        key,
        body: pdfBuffer,
        contentType: 'application/pdf',
    });

    if (!uploadResult?.ok || !uploadResult?.url) {
        const detail = uploadResult?.detail || uploadResult?.reason || 'Storage upload failed';
        console.error('[ConstructorPfpPersist] PDF upload failed:', detail);
        return null;
    }

    return uploadResult.url;
}

/**
 * Persist + публичный URL PDF (ошибка PDF не откатывает клиента).
 */
async function persistConstructorFirstRunAndUploadPdf({
    constructorClientRow,
    bot,
    extraction,
    calculationResponse,
}) {
    const { clientId } = await persistConstructorCalculationToPfpClient({
        constructorClientRow,
        bot,
        extraction,
        calculationResponse,
    });

    let pdfUrl = null;
    try {
        pdfUrl = await uploadConstructorClientReportPdf({
            clientId,
            agentId: bot.agent_id,
            projectId: bot.project_id,
        });
    } catch (pdfErr) {
        console.error('[ConstructorPfpPersist] generateClientReportPdfPackage failed:', pdfErr.message || pdfErr);
    }

    if (!pdfUrl) {
        const token = signSiteChatReportPdfToken({ clientId, projectId: bot.project_id });
        pdfUrl = buildSiteChatReportPdfUrl(token);
        if (pdfUrl) {
            console.warn('[ConstructorPfpPersist] R2 URL missing — using signed report-pdf link for site-chat');
        } else if (!token) {
            console.error(
                '[ConstructorPfpPersist] No PDF URL: R2 failed and JWT_SECRET missing (cannot sign fallback link)'
            );
        } else if (!getSiteChatReportPdfPublicBase()) {
            console.error(
                '[ConstructorPfpPersist] No PDF URL: R2 failed; set PFP_PUBLIC_API_BASE_URL for signed PDF link (see .env.example)'
            );
        }
    }

    return { clientId, pdfUrl };
}

module.exports = {
    buildConstructorPfpSaveBody,
    persistConstructorCalculationToPfpClient,
    uploadConstructorClientReportPdf,
    persistConstructorFirstRunAndUploadPdf,
};
