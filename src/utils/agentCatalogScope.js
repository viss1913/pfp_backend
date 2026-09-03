/**
 * Персональный каталог агента: продукты, портфели, инфляция, доходности, рост расходов.
 * Слои: agent overlay → project (agent_id IS NULL) → system (project_id IS NULL).
 * Субагент не наследует каталог куратора — у каждого свой agent_id.
 */

const AGENT_OVERLAY_SETTING_KEYS = [
    'inflation_rate_year',
    'inflation_rate_matrix',
    'investment_expense_growth_monthly',
    'investment_expense_growth_annual',
    'passive_income_yield',
];

function normalizeAgentId(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeProjectId(value) {
    if (value == null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function isAgentOwnedSettingKey(key) {
    return AGENT_OVERLAY_SETTING_KEYS.includes(String(key || '').trim());
}

function catalogAgentIdFromUser(user) {
    const role = String(user?.role || '').toLowerCase();
    if (user?.isAdmin || role === 'admin' || role === 'super_admin') return null;
    return normalizeAgentId(user?.agentId);
}

function resolveCalcAgentId(clientData = {}, options = {}) {
    return normalizeAgentId(clientData.agent_id)
        || normalizeAgentId(clientData.agentId)
        || normalizeAgentId(options.agentId)
        || normalizeAgentId(options.catalogAgentId);
}

function isOwnCatalogRow(row, agentId) {
    const aid = normalizeAgentId(agentId);
    return aid != null && normalizeAgentId(row?.agent_id) === aid;
}

function isSharedCatalogRow(row) {
    return normalizeAgentId(row?.agent_id) == null;
}

function catalogPriority(row, agentId) {
    if (isOwnCatalogRow(row, agentId)) return 3;
    if (row?.project_id != null && isSharedCatalogRow(row)) return 2;
    return 1;
}

function pickPreferredCatalogRow(rows, agentId) {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return [...rows].sort((a, b) => catalogPriority(b, agentId) - catalogPriority(a, agentId))[0];
}

function pickPreferredSettingRow(rows, { projectId = null, agentId = null } = {}) {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const pid = normalizeProjectId(projectId);
    const aid = normalizeAgentId(agentId);

    if (aid && pid) {
        const own = rows.find((r) => normalizeProjectId(r.project_id) === pid && normalizeAgentId(r.agent_id) === aid);
        if (own) return own;
    }
    if (pid) {
        const project = rows.find((r) => normalizeProjectId(r.project_id) === pid && isSharedCatalogRow(r));
        if (project) return project;
    }
    return rows.find((r) => r.project_id == null && isSharedCatalogRow(r)) || null;
}

function mergeSettingsByKey(rows, { projectId = null, agentId = null } = {}) {
    const grouped = new Map();
    for (const row of rows || []) {
        const key = row?.key;
        if (!key) continue;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(row);
    }
    const merged = [];
    for (const list of grouped.values()) {
        const picked = pickPreferredSettingRow(list, { projectId, agentId });
        if (picked) merged.push(picked);
    }
    return merged;
}

function settingScope(row) {
    if (normalizeAgentId(row?.agent_id)) return 'agent';
    if (row?.project_id != null) return 'project';
    return 'system';
}

function hideSharedIfAgentCloned(rows, agentId) {
    const aid = normalizeAgentId(agentId);
    if (aid == null || !Array.isArray(rows)) return rows || [];
    const clonedFrom = new Set(
        rows
            .filter((r) => isOwnCatalogRow(r, aid) && r.cloned_from_id != null)
            .map((r) => Number(r.cloned_from_id))
            .filter((id) => Number.isFinite(id) && id > 0)
    );
    if (clonedFrom.size === 0) return rows;
    return rows.filter((r) => {
        if (clonedFrom.has(Number(r.id)) && isSharedCatalogRow(r)) return false;
        return true;
    });
}

/**
 * Knex: чужие agent-строки никогда не смешиваются.
 * agentId задан — свои + shared; иначе только shared.
 */
function whereVisibleCatalog(builder, agentId, column = 'agent_id') {
    const aid = normalizeAgentId(agentId);
    if (aid) {
        builder.where(column, aid).orWhereNull(column);
        return;
    }
    builder.whereNull(column);
}

function catalogQueryFromContext(context, extra = {}) {
    return {
        projectId: context?.projectId ?? null,
        agentId: context?.agentId ?? null,
        ...extra,
    };
}

module.exports = {
    AGENT_OVERLAY_SETTING_KEYS,
    normalizeAgentId,
    normalizeProjectId,
    isAgentOwnedSettingKey,
    catalogAgentIdFromUser,
    resolveCalcAgentId,
    isOwnCatalogRow,
    isSharedCatalogRow,
    catalogPriority,
    pickPreferredCatalogRow,
    pickPreferredSettingRow,
    mergeSettingsByKey,
    settingScope,
    hideSharedIfAgentCloned,
    whereVisibleCatalog,
    catalogQueryFromContext,
};
