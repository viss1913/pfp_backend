const { isYadroProjectMeta } = require('../yadro/yadroTemplateProjects');

const DEFAULT_THEME_KEY = 'default';
const ROSTECH_THEME_KEY = 'rostech';
const YADRO_THEME_KEY = 'yadro';

/** Пенсионный PDF в стиле Ростех (фиолетовый #722257): Ростех prod + Immers test + НПФ Ренессанс. */
const ROSTECH_STYLE_REPORT_PROJECT_IDS = new Set([22, 6, 4]);

/** Prod Ростех (Railway/YC). */
const ROSTECH_PROJECT_ID = 22;
/** Ростех на Immers test (tenant ROSTECH, slug rostech). */
const ROSTECH_IMMERS_PROJECT_ID = 6;
const NPF_RENESSANS_PROJECT_ID = 4;

/** HTML-макет Rostech_report v2 (Figma): только Immers tenant ROSTECH (project 6). */
const ROSTECH_REPORT_V2_PROJECT_IDS = new Set([ROSTECH_IMMERS_PROJECT_ID]);

/**
 * @param {number|string|null|undefined} projectId
 * @param {{ slug?: string, name?: string, public_key?: string }|null} [project]
 */
function resolveReportThemeKey(projectId, project = null) {
    const pid = projectId == null ? null : Number(projectId);
    if (isYadroProjectMeta(project)) return YADRO_THEME_KEY;
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

async function resolveReportThemeKeyAsync(projectId) {
    let project = null;
    const pid = projectId == null ? null : Number(projectId);
    if (Number.isFinite(pid) && pid > 0) {
        try {
            const projectRepository = require('../../repositories/projectRepository');
            project = await projectRepository.findById(pid);
        } catch (err) {
            console.warn('[themeResolver] findById failed:', err?.message || err);
        }
    }
    const theme = resolveReportThemeKey(projectId, project);
    if (theme === YADRO_THEME_KEY || theme === ROSTECH_THEME_KEY) {
        console.log(
            `[themeResolver] ${theme} theme for projectId=${projectId} slug=${project?.slug || '—'} key=${project?.public_key || '—'} v2=${isRostechReportV2Project(projectId)}`
        );
    }
    return theme;
}

module.exports = {
    DEFAULT_THEME_KEY,
    ROSTECH_THEME_KEY,
    YADRO_THEME_KEY,
    ROSTECH_STYLE_REPORT_PROJECT_IDS,
    ROSTECH_PROJECT_ID,
    ROSTECH_IMMERS_PROJECT_ID,
    ROSTECH_REPORT_V2_PROJECT_IDS,
    NPF_RENESSANS_PROJECT_ID,
    resolveReportThemeKey,
    resolveReportThemeKeyAsync,
    isRostechStyleReportProject,
    isRostechReportV2Project,
};
