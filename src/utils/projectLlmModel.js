/**
 * Per-project LLM model resolution.
 * Global default: OpenRouter (OPENROUTER_MODEL / ai_b2c_settings.openrouter_model).
 * NPF Rostech tenants: force GigaChat (ROSTECH_LLM_MODEL / GIGACHAT_MODEL).
 */

const {
    isRostechStyleReportProject,
    ROSTECH_STYLE_REPORT_PROJECT_IDS,
} = require('../reports/themes/themeResolver');
const { isRostechProjectMeta } = require('../reports/rostech/rostechTemplateProjects');

function resolveRostechLlmModel() {
    return (
        String(process.env.ROSTECH_LLM_MODEL || process.env.GIGACHAT_MODEL || 'GigaChat-2-Pro').trim() ||
        'GigaChat-2-Pro'
    );
}

/**
 * Sync check by known Rostech-style project ids (6 Immers, 22 prod, 4 Renessans, …).
 * @param {number|string|null|undefined} projectId
 */
function isRostechLlmProjectId(projectId) {
    return isRostechStyleReportProject(projectId);
}

/**
 * Async: also match slug/name/public_key (песочница и прочие стенды).
 * @param {number|string|null|undefined} projectId
 * @returns {Promise<boolean>}
 */
async function isRostechLlmProject(projectId) {
    if (isRostechLlmProjectId(projectId)) return true;
    const pid = projectId == null ? null : Number(projectId);
    if (!Number.isFinite(pid) || pid <= 0) return false;
    try {
        const projectRepository = require('../repositories/projectRepository');
        const project = await projectRepository.findById(pid);
        return isRostechProjectMeta(project);
    } catch (_) {
        return false;
    }
}

/**
 * Model id to pass into aiService (provider switches on GigaChat* → gigachat).
 * @param {number|string|null|undefined} projectId
 * @param {string|null|undefined} dbOrFallbackModel from ai_b2c_settings / caller
 * @returns {Promise<string|null>}
 */
async function resolveProjectLlmModel(projectId, dbOrFallbackModel = null) {
    if (await isRostechLlmProject(projectId)) {
        return resolveRostechLlmModel();
    }
    const fromDb = dbOrFallbackModel != null ? String(dbOrFallbackModel).trim() : '';
    if (fromDb) return fromDb;
    const fromEnv = String(process.env.OPENROUTER_MODEL || '').trim();
    return fromEnv || null;
}

module.exports = {
    resolveRostechLlmModel,
    isRostechLlmProjectId,
    isRostechLlmProject,
    resolveProjectLlmModel,
    ROSTECH_STYLE_REPORT_PROJECT_IDS,
};
