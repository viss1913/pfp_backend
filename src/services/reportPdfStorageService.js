const knex = require('../config/database');
const reportPdfService = require('./reportPdfService');
const pdfCompressionService = require('./pdfCompressionService');
const { uploadPublicFile } = require('../utils/r2Client');

const inFlightByClient = new Map();

function buildPdfStorageKey({ projectId, clientId, fileNamePrefix }) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    return `pdf-reports/${projectId || 'no-project'}/${clientId}/${fileNamePrefix}-${ts}.pdf`;
}

function shouldKeepOnlyCompressed() {
    const v = String(process.env.REPORT_PDF_ONLY_COMPRESSED || '1').trim().toLowerCase();
    return !(v === '0' || v === 'false' || v === 'no');
}

async function uploadPdfByKey({ key, pdfBuffer }) {
    const uploadResult = await uploadPublicFile({
        key,
        body: pdfBuffer,
        contentType: 'application/pdf',
    });
    if (!uploadResult?.ok || !uploadResult?.url) {
        const detail = uploadResult?.detail || uploadResult?.reason || 'Storage upload failed';
        throw new Error(detail);
    }
    return uploadResult.url;
}

async function maybeCompressPdfBuffer(pdfBuffer) {
    if (!pdfCompressionService.isPdfGsCompressionEnabled()) {
        return { buffer: pdfBuffer, compressed: false, reason: 'compression_disabled' };
    }
    const compressed = await pdfCompressionService.compressPdfBufferWithGhostscript(pdfBuffer);
    if (!compressed || compressed.length <= 0) {
        return { buffer: pdfBuffer, compressed: false, reason: 'compression_empty' };
    }
    return { buffer: compressed, compressed: true, reason: null };
}

async function generateAndUploadClientReportPdf({
    clientId,
    projectId,
    agentId = null,
    brandingAgentId = null,
    includeCover = true,
    includeSummary = true,
    goalTypes = null,
    fileNamePrefix = 'report',
}) {
    const { pdfBuffer, toc } = await reportPdfService.generateClientReportPdfPackage({
        clientId,
        projectId,
        agentId,
        brandingAgentId,
        includeCover,
        includeSummary,
        goalTypes,
    });

    const key = buildPdfStorageKey({ projectId, clientId, fileNamePrefix });
    const compressedRes = await maybeCompressPdfBuffer(pdfBuffer);

    try {
        const pdfUrl = await uploadPdfByKey({ key, pdfBuffer: compressedRes.buffer });
        return {
            pdfUrl,
            toc: Array.isArray(toc) ? toc : [],
            compressed: compressedRes.compressed,
            compressionReason: compressedRes.reason,
        };
    } catch (err) {
        if (compressedRes.compressed || shouldKeepOnlyCompressed()) {
            throw err;
        }
        const fallbackUrl = await uploadPdfByKey({ key, pdfBuffer });
        return {
            pdfUrl: fallbackUrl,
            toc: Array.isArray(toc) ? toc : [],
            compressed: false,
            compressionReason: 'compression_upload_failed_fallback_original',
        };
    }
}

function clientPdfTaskKey({ clientId, projectId }) {
    return `${projectId || 'no-project'}:${clientId}`;
}

async function getClientPdfCacheRow({ clientId, projectId }) {
    const q = knex('clients')
        .select('id', 'report_pdf_status', 'report_pdf_url', 'report_pdf_generated_at', 'report_pdf_updated_at', 'report_pdf_error')
        .where('id', clientId);
    if (projectId) q.andWhere('project_id', projectId);
    return q.first();
}

async function updateClientPdfCache({ clientId, projectId, patch }) {
    const q = knex('clients').where('id', clientId);
    if (projectId) q.andWhere('project_id', projectId);
    return q.update({
        ...patch,
        report_pdf_updated_at: knex.fn.now(),
    });
}

function normalizeCacheStatus(row) {
    if (!row) return 'missing';
    const s = String(row.report_pdf_status || '').trim().toLowerCase();
    if (!s) return 'missing';
    return s;
}

async function runClientPdfGenerationTask({
    clientId,
    projectId,
    agentId = null,
    brandingAgentId = null,
    includeCover = true,
    includeSummary = true,
    goalTypes = null,
    fileNamePrefix = 'report',
}) {
    await updateClientPdfCache({
        clientId,
        projectId,
        patch: {
            report_pdf_status: 'processing',
            report_pdf_error: null,
        },
    });

    try {
        const generated = await generateAndUploadClientReportPdf({
            clientId,
            projectId,
            agentId,
            brandingAgentId,
            includeCover,
            includeSummary,
            goalTypes,
            fileNamePrefix,
        });
        await updateClientPdfCache({
            clientId,
            projectId,
            patch: {
                report_pdf_status: 'ready',
                report_pdf_url: generated.pdfUrl,
                report_pdf_generated_at: knex.fn.now(),
                report_pdf_error: null,
            },
        });
        return {
            status: 'ready',
            pdfUrl: generated.pdfUrl,
            toc: generated.toc || [],
            compressed: !!generated.compressed,
            generatedAt: new Date().toISOString(),
        };
    } catch (err) {
        await updateClientPdfCache({
            clientId,
            projectId,
            patch: {
                report_pdf_status: 'failed',
                report_pdf_error: String(err?.message || err || 'PDF generation failed').slice(0, 1000),
            },
        });
        throw err;
    }
}

function startClientPdfGenerationTask(args) {
    const key = clientPdfTaskKey(args);
    const existing = inFlightByClient.get(key);
    if (existing) return existing;

    const p = runClientPdfGenerationTask(args)
        .catch((e) => {
            console.warn('[reportPdfStorage] PDF task failed:', e.message || e);
            return {
                status: 'failed',
                error: String(e?.message || e || 'PDF generation failed').slice(0, 500),
            };
        })
        .finally(() => {
            inFlightByClient.delete(key);
        });
    inFlightByClient.set(key, p);
    return p;
}

async function ensureClientReportPdfReady({
    clientId,
    projectId,
    agentId = null,
    brandingAgentId = null,
    includeCover = true,
    includeSummary = true,
    goalTypes = null,
    fileNamePrefix = 'report',
    forceRegenerate = false,
    waitForResult = false,
}) {
    const cacheRow = await getClientPdfCacheRow({ clientId, projectId });
    const cacheStatus = normalizeCacheStatus(cacheRow);
    const taskKey = clientPdfTaskKey({ clientId, projectId });
    const runningTask = inFlightByClient.get(taskKey);

    if (!forceRegenerate && cacheStatus === 'ready' && cacheRow?.report_pdf_url) {
        return {
            status: 'ready',
            pdfUrl: cacheRow.report_pdf_url,
            toc: [],
            compressed: true,
            generatedAt: cacheRow.report_pdf_generated_at || cacheRow.report_pdf_updated_at || null,
            fromCache: true,
        };
    }

    const task =
        runningTask ||
        startClientPdfGenerationTask({
            clientId,
            projectId,
            agentId,
            brandingAgentId,
            includeCover,
            includeSummary,
            goalTypes,
            fileNamePrefix,
        });

    if (!waitForResult) {
        return {
            status: 'processing',
            pdfUrl: cacheRow?.report_pdf_url || null,
            toc: [],
            compressed: cacheStatus === 'ready',
            generatedAt: cacheRow?.report_pdf_generated_at || cacheRow?.report_pdf_updated_at || null,
            fromCache: false,
        };
    }

    return await task;
}

async function getClientReportPdfCacheStatus({ clientId, projectId }) {
    const row = await getClientPdfCacheRow({ clientId, projectId });
    const status = normalizeCacheStatus(row);
    return {
        status: status === 'missing' ? 'idle' : status,
        pdfUrl: row?.report_pdf_url || null,
        generatedAt: row?.report_pdf_generated_at || row?.report_pdf_updated_at || null,
        error: row?.report_pdf_error || null,
        processing: inFlightByClient.has(clientPdfTaskKey({ clientId, projectId })),
    };
}

module.exports = {
    generateAndUploadClientReportPdf,
    maybeCompressPdfBuffer,
    ensureClientReportPdfReady,
    getClientReportPdfCacheStatus,
};
