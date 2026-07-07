const DEFAULT_THEME_KEY = 'default';
const ROSTECH_THEME_KEY = 'rostech';

/** Пенсионный PDF в стиле Ростех (фиолетовый #722257): Ростех prod + Immers test + НПФ Ренессанс. */
const ROSTECH_STYLE_REPORT_PROJECT_IDS = new Set([22, 6, 4]);

/** Prod Ростех (Railway/YC). */
const ROSTECH_PROJECT_ID = 22;
/** Ростех на Immers test (tenant ROSTECH, slug rostech). */
const ROSTECH_IMMERS_PROJECT_ID = 6;
const NPF_RENESSANS_PROJECT_ID = 4;

/** Новый HTML-макет Rostech_report (обложка + pension/investment v2): только Immers tenant ROSTECH. */
const ROSTECH_REPORT_V2_PROJECT_IDS = new Set([ROSTECH_IMMERS_PROJECT_ID]);

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

function isRostechReportV2Project(projectId) {
    const pid = projectId == null ? null : Number(projectId);
    return pid != null && ROSTECH_REPORT_V2_PROJECT_IDS.has(pid);
}

module.exports = {
    DEFAULT_THEME_KEY,
    ROSTECH_THEME_KEY,
    ROSTECH_STYLE_REPORT_PROJECT_IDS,
    ROSTECH_PROJECT_ID,
    ROSTECH_IMMERS_PROJECT_ID,
    ROSTECH_REPORT_V2_PROJECT_IDS,
    NPF_RENESSANS_PROJECT_ID,
    resolveReportThemeKey,
    isRostechStyleReportProject,
    isRostechReportV2Project,
};

