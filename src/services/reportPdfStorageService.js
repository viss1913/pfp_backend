const reportPdfService = require('./reportPdfService');
const pdfCompressionService = require('./pdfCompressionService');
const { uploadPublicFile } = require('../utils/r2Client');

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

module.exports = {
    generateAndUploadClientReportPdf,
    maybeCompressPdfBuffer,
};
