/**
 * ИИ в PDF-отчётах (Finam HTML/PDF, executive summary в JSON отчёта).
 * Выключить: PFP_PDF_FINAM_AI=0 | false | off | no | disabled
 */
function isReportPdfAiEnabled() {
    const v = process.env.PFP_PDF_FINAM_AI;
    if (v == null || String(v).trim() === '') return true;
    const s = String(v).trim().toLowerCase();
    if (['0', 'false', 'off', 'no', 'disabled'].includes(s)) return false;
    return true;
}

module.exports = { isReportPdfAiEnabled };
