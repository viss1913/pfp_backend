const settingsService = require('../../services/settingsService');
const { isFinamTemplateProject } = require('./finamTemplateProjects');

const FINAM_REPORT_SETTING_KEY = 'report_finam';
const FINAM_REPORT_VERSION_V1 = 1;
const FINAM_REPORT_VERSION_V2 = 2;

/** Finam «основной» проект; при env-оверрайде без списка — только он, не 23 (AV). */
const FINAM_REPORT_VERSION_ENV_DEFAULT_PROJECT_IDS = [14];

function normalizeFinamReportVersion(value) {
    const n = Number(value);
    return n === FINAM_REPORT_VERSION_V2 ? FINAM_REPORT_VERSION_V2 : FINAM_REPORT_VERSION_V1;
}

/**
 * Опциональный оверрайд для Railway: сильнее project-scoped БД.
 * - `FINAM_REPORT_VERSION` — `1` или `2`; пусто/не задано → только БД.
 * - `FINAM_REPORT_VERSION_PROJECT_IDS` — CSV id проектов, на которых действует оверрайд;
 *   если `FINAM_REPORT_VERSION` задан, а список пустой → по умолчанию только `14`.
 */
function resolveFinamReportVersionFromEnv(projectId) {
    const raw = process.env.FINAM_REPORT_VERSION;
    if (raw == null || String(raw).trim() === '') {
        return null;
    }
    const version = normalizeFinamReportVersion(raw);
    const rawIds = process.env.FINAM_REPORT_VERSION_PROJECT_IDS;
    let ids;
    if (rawIds == null || String(rawIds).trim() === '') {
        ids = [...FINAM_REPORT_VERSION_ENV_DEFAULT_PROJECT_IDS];
    } else {
        ids = String(rawIds)
            .split(',')
            .map((s) => Number(String(s).trim()))
            .filter((n) => Number.isFinite(n) && n > 0);
        if (ids.length === 0) {
            ids = [...FINAM_REPORT_VERSION_ENV_DEFAULT_PROJECT_IDS];
        }
    }
    const pid = projectId == null ? NaN : Number(projectId);
    if (!Number.isFinite(pid) || pid <= 0 || !ids.includes(pid)) {
        return null;
    }
    return version;
}

async function resolveFinamReportVersion({ projectId, themeKey } = {}) {
    if (themeKey === 'rostech' || !isFinamTemplateProject(projectId)) {
        return FINAM_REPORT_VERSION_V1;
    }

    const envVersion = resolveFinamReportVersionFromEnv(projectId);
    if (envVersion != null) {
        return envVersion;
    }

    let setting = null;
    try {
        setting = await settingsService.getSettingByKey(FINAM_REPORT_SETTING_KEY, projectId);
    } catch (_) {
        return FINAM_REPORT_VERSION_V1;
    }

    // v2 включаем только явным project-scoped override, чтобы global default не задел AV/другие Finam-template тенанты.
    if (!projectId || Number(setting?.project_id) !== Number(projectId)) {
        return FINAM_REPORT_VERSION_V1;
    }

    return normalizeFinamReportVersion(setting.value);
}

module.exports = {
    FINAM_REPORT_SETTING_KEY,
    FINAM_REPORT_VERSION_V1,
    FINAM_REPORT_VERSION_V2,
    FINAM_REPORT_VERSION_ENV_DEFAULT_PROJECT_IDS,
    normalizeFinamReportVersion,
    resolveFinamReportVersionFromEnv,
    resolveFinamReportVersion,
};
