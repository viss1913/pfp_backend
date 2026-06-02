/**
 * Настройки витрины Comon в JSON projects.settings: { comon_showcase: { ... } }
 * Включается только при enabled: true.
 */

const DEFAULT_SHOWCASE = {
    enabled: false,
    // Default aligns with Comon standalone page layout (2x6 cards).
    max_items: 12,
    require_tags: [],
    exclude_archived: true,
    /** Сопоставление risk_profile клиента (CONSERVATIVE|BALANCED|AGGRESSIVE) → допустимые riskLevel Comon */
    risk_map: {
        CONSERVATIVE: [1, 2],
        BALANCED: [1, 2, 3],
        AGGRESSIVE: [2, 3, 4, 5],
    },
    /** Поле клиента для сравнения с minSum: total_liquid_capital | net_worth | none */
    min_sum_field: 'total_liquid_capital',
    cache_ttl_ms: 300000,
    list_page_size: 100,
    max_list_pages: 3,
    /** Показывать витрину только если в сводном портфеле есть эти product_type (по умолчанию STOCK). */
    gate_product_types: ['STOCK'],
};
const DEFAULT_COMON_SHOWCASE_PROJECT_IDS = [2, 14];

function parseProjectSettingsJson(settings) {
    if (settings == null) return {};
    if (typeof settings === 'string') {
        try {
            return JSON.parse(settings);
        } catch {
            return {};
        }
    }
    if (typeof settings === 'object') return { ...settings };
    return {};
}

function parseComonShowcaseProjectIds() {
    const raw = process.env.COMON_SHOWCASE_PROJECT_IDS;
    if (raw == null || String(raw).trim() === '') {
        return [...DEFAULT_COMON_SHOWCASE_PROJECT_IDS];
    }
    return String(raw)
        .split(',')
        .map((s) => Number(String(s).trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
}

function isComonShowcaseProject(project) {
    const pid = Number(project?.id);
    return Number.isFinite(pid) && parseComonShowcaseProjectIds().includes(pid);
}

/**
 * @returns {null|object} null если витрина выключена или нет блока
 */
function getComonShowcaseConfigFromProject(project) {
    if (!project) return null;
    // Разрешаем витрину только для Finam test/prod, не задевая другие finam-like тенанты.
    if (!isComonShowcaseProject(project)) return null;
    const root = parseProjectSettingsJson(project.settings);
    const raw = root.comon_showcase;
    // For Finam project, allow showcase with defaults even when explicit settings are missing.
    if (!raw || typeof raw !== 'object') {
        return {
            ...DEFAULT_SHOWCASE,
            enabled: true,
        };
    }
    if (!raw.enabled) return null;

    const risk_map = {
        ...DEFAULT_SHOWCASE.risk_map,
        ...(typeof raw.risk_map === 'object' && raw.risk_map !== null ? raw.risk_map : {}),
    };
    for (const k of Object.keys(risk_map)) {
        if (!Array.isArray(risk_map[k])) {
            risk_map[k] = DEFAULT_SHOWCASE.risk_map[k] || [1, 2, 3];
        } else {
            risk_map[k] = risk_map[k].map((x) => Number(x)).filter((n) => Number.isFinite(n));
        }
    }

    const require_tags = Array.isArray(raw.require_tags)
        ? raw.require_tags.map((t) => String(t).trim()).filter(Boolean)
        : DEFAULT_SHOWCASE.require_tags;

    const gate_product_types = Array.isArray(raw.gate_product_types)
        ? raw.gate_product_types.map((t) => String(t).toUpperCase().trim()).filter(Boolean)
        : DEFAULT_SHOWCASE.gate_product_types;

    const min_sum_field = ['total_liquid_capital', 'net_worth', 'none'].includes(raw.min_sum_field)
        ? raw.min_sum_field
        : DEFAULT_SHOWCASE.min_sum_field;

    return {
        ...DEFAULT_SHOWCASE,
        ...raw,
        enabled: true,
        risk_map,
        require_tags,
        gate_product_types,
        min_sum_field,
        max_items: Math.min(50, Math.max(1, Number(raw.max_items) || DEFAULT_SHOWCASE.max_items)),
        cache_ttl_ms: Math.min(3_600_000, Math.max(30_000, Number(raw.cache_ttl_ms) || DEFAULT_SHOWCASE.cache_ttl_ms)),
        list_page_size: Math.min(200, Math.max(10, Number(raw.list_page_size) || DEFAULT_SHOWCASE.list_page_size)),
        max_list_pages: Math.min(20, Math.max(1, Number(raw.max_list_pages) || DEFAULT_SHOWCASE.max_list_pages)),
        exclude_archived: raw.exclude_archived !== false,
    };
}

module.exports = {
    DEFAULT_COMON_SHOWCASE_PROJECT_IDS,
    DEFAULT_SHOWCASE,
    isComonShowcaseProject,
    parseComonShowcaseProjectIds,
    getComonShowcaseConfigFromProject,
    parseProjectSettingsJson,
};
