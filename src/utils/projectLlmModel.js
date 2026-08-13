/**
 * Per-project LLM model resolution.
 * Global default: OpenRouter (OPENROUTER_MODEL / ai_b2c_settings.openrouter_model).
 * NPF Rostech tenants: ROSTECH_LLM_MODEL override, else OpenRouter google/gemini-2.5-flash
 * when OPENROUTER_API_KEY is set; then Immers Ollama; then GigaChat.
 */

const ROSTECH_OPENROUTER_DEFAULT_MODEL = 'google/gemini-2.5-flash';

const {
    isRostechStyleReportProject,
    ROSTECH_STYLE_REPORT_PROJECT_IDS,
} = require('../reports/themes/themeResolver');
const { isRostechProjectMeta } = require('../reports/rostech/rostechTemplateProjects');

function hasOpenRouterKey() {
    return Boolean(String(process.env.OPENROUTER_API_KEY || '').trim());
}

function hasImmersLlmKey() {
    const key = String(
        process.env.IMMERS_LLM_API_KEY || process.env.LLM_API_KEY || process.env.MARLON_LLM_SERVICE_KEY || ''
    ).trim();
    return Boolean(key);
}

function looksLikeImmersLlmModelId(model) {
    const m = String(model || '').trim().toLowerCase();
    if (!m || m.includes('/')) return false;
    return /^(qwen[\w.-]*|gemma[\w.-]*|llama[\w.-]*|mistral[\w.-]*):\S+$/i.test(m);
}

function resolveRostechLlmModel() {
    const fromEnv = String(process.env.ROSTECH_LLM_MODEL || '').trim();
    if (fromEnv) return fromEnv;

    // Current default: OpenRouter Gemini when key is configured.
    if (hasOpenRouterKey()) {
        return ROSTECH_OPENROUTER_DEFAULT_MODEL;
    }

    // Fallback: Immers auditor LLM when key is configured.
    if (hasImmersLlmKey()) {
        return String(process.env.IMMERS_LLM_MODEL || 'qwen2.5:7b-instruct').trim() || 'qwen2.5:7b-instruct';
    }

    return (
        String(process.env.GIGACHAT_MODEL || 'GigaChat-3-Ultra').trim() ||
        'GigaChat-3-Ultra'
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
 * Model id to pass into aiService (provider switches on GigaChat* → gigachat,
 * qwen*: / gemma*: → immers_llm).
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
    looksLikeImmersLlmModelId,
    ROSTECH_OPENROUTER_DEFAULT_MODEL,
    ROSTECH_STYLE_REPORT_PROJECT_IDS,
};
