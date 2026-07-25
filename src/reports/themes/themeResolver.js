const { isYadroProjectMeta } = require('../yadro/yadroTemplateProjects');

const DEFAULT_THEME_KEY = 'default';
const ROSTECH_THEME_KEY = 'rostech';
const YADRO_THEME_KEY = 'yadro';

/**
 * @param {number|string|null|undefined} projectId
 * @param {{ slug?: string, name?: string, public_key?: string }|null} [project]
 */
function resolveReportThemeKey(projectId, project = null) {
    const pid = projectId == null ? null : Number(projectId);
    if (isYadroProjectMeta(project)) return YADRO_THEME_KEY;
    if (pid === 22) return ROSTECH_THEME_KEY;
    return DEFAULT_THEME_KEY;
}

/**
 * Подтягивает projects и резолвит тему.
 * Репозиторий напрямую — без projectService (меньше риск circular require).
 */
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
    if (theme === YADRO_THEME_KEY) {
        console.log(
            `[themeResolver] yadro theme for projectId=${projectId} slug=${project?.slug || '—'} key=${project?.public_key || '—'}`
        );
    }
    return theme;
}

module.exports = {
    DEFAULT_THEME_KEY,
    ROSTECH_THEME_KEY,
    YADRO_THEME_KEY,
    resolveReportThemeKey,
    resolveReportThemeKeyAsync,
};
