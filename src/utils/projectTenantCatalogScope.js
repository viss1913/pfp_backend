/**
 * Проекты, которые должны работать только со своими продуктами/портфелями
 * без fallback на системные записи (`project_id IS NULL`).
 *
 * Оверрайд через env:
 *   PROJECT_CATALOG_ONLY_PROJECT_IDS=3,42
 */
const DEFAULT_PROJECT_CATALOG_ONLY_PROJECT_IDS = [3];

function parseProjectCatalogOnlyProjectIds() {
    const raw = process.env.PROJECT_CATALOG_ONLY_PROJECT_IDS;
    if (raw == null || String(raw).trim() === '') {
        return new Set(DEFAULT_PROJECT_CATALOG_ONLY_PROJECT_IDS);
    }
    const ids = String(raw)
        .split(',')
        .map((s) => Number(String(s).trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
    return ids.length > 0
        ? new Set(ids)
        : new Set(DEFAULT_PROJECT_CATALOG_ONLY_PROJECT_IDS);
}

function isProjectCatalogOnly(projectId) {
    const pid = projectId == null ? NaN : Number(projectId);
    if (!Number.isFinite(pid) || pid <= 0) return false;
    return parseProjectCatalogOnlyProjectIds().has(pid);
}

function shouldIncludeSystemCatalog(projectId, includeDefaults = true) {
    return Boolean(includeDefaults) && !isProjectCatalogOnly(projectId);
}

module.exports = {
    DEFAULT_PROJECT_CATALOG_ONLY_PROJECT_IDS,
    parseProjectCatalogOnlyProjectIds,
    isProjectCatalogOnly,
    shouldIncludeSystemCatalog,
};
