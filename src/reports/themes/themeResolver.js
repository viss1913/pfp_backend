const DEFAULT_THEME_KEY = 'default';
const ROSTECH_THEME_KEY = 'rostech';

/** Пенсионный PDF в стиле Ростех (фиолетовый #722257): Ростех prod + НПФ Ренессанс (Immers). */
const ROSTECH_STYLE_REPORT_PROJECT_IDS = new Set([22, 4]);

const ROSTECH_PROJECT_ID = 22;
const NPF_RENESSANS_PROJECT_ID = 4;

/**
 * Возвращает ключ темы отчёта по projectId.
 */
function resolveReportThemeKey(projectId) {
    const pid = projectId == null ? null : Number(projectId);
    if (pid != null && ROSTECH_STYLE_REPORT_PROJECT_IDS.has(pid)) return ROSTECH_THEME_KEY;
    return DEFAULT_THEME_KEY;
}

function isRostechStyleReportProject(projectId) {
    const pid = projectId == null ? null : Number(projectId);
    return pid != null && ROSTECH_STYLE_REPORT_PROJECT_IDS.has(pid);
}

module.exports = {
    DEFAULT_THEME_KEY,
    ROSTECH_THEME_KEY,
    ROSTECH_STYLE_REPORT_PROJECT_IDS,
    ROSTECH_PROJECT_ID,
    NPF_RENESSANS_PROJECT_ID,
    resolveReportThemeKey,
    isRostechStyleReportProject,
};

