/**
 * Проекты, для которых PDF собирается пайплайном HTML из src/reports/finam/.
 * 14 — Финам; 23 — AV Информ (те же шаблоны, отдельный тенант). Проект 14 не «владеет» кодом.
 */
const DEFAULT_FINAM_TEMPLATE_PROJECT_IDS = [14, 23];

function parseFinamTemplateProjectIds() {
    const raw = process.env.FINAM_REPORT_PROJECT_IDS;
    if (raw == null || String(raw).trim() === '') {
        return [...DEFAULT_FINAM_TEMPLATE_PROJECT_IDS];
    }
    return String(raw)
        .split(',')
        .map((s) => Number(String(s).trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
}

function isFinamTemplateProject(projectId) {
    const pid = projectId == null ? NaN : Number(projectId);
    if (!Number.isFinite(pid) || pid <= 0) return false;
    return parseFinamTemplateProjectIds().includes(pid);
}

module.exports = {
    DEFAULT_FINAM_TEMPLATE_PROJECT_IDS,
    parseFinamTemplateProjectIds,
    isFinamTemplateProject,
};
