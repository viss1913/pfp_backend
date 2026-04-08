const fs = require('fs');
const path = require('path');
const projectRepository = require('../repositories/projectRepository');
const comonRecommendedStrategyRepository = require('../repositories/comonRecommendedStrategyRepository');
const { getComonShowcaseConfigFromProject } = require('../utils/projectComonShowcaseSettings');

const DISCLAIMER_RU =
    'Информация носит ознакомительный характер и не является индивидуальной инвестиционной рекомендацией. ' +
    'Доходность в прошлом не гарантирует доходность в будущем. Условия стратегий на стороне оператора (Comon) могут меняться. ' +
    'Подбор стратегий на экране выполняется автоматически по общим критериям (в т.ч. риск-профиль и минимальная сумма) и не заменяет консультацию.';

/** @type {Map<string, { expires: number, rows: object[], dbVersion?: number, sourceMtime?: number|null }>} */
const listCacheByProject = new Map();
const MANUAL_SOURCE_DEFAULT = path.resolve(process.cwd(), 'data', 'comonRecommendedStrategies.json');
let manualSourceMtimeMs = null;

function cacheKeyProject(projectId) {
    return String(projectId);
}

function normalizeRiskProfile(raw) {
    const u = String(raw || 'BALANCED').toUpperCase();
    if (u === 'CONSERVATIVE' || u === 'BALANCED' || u === 'AGGRESSIVE') return u;
    return 'BALANCED';
}

function allowedRiskLevels(config, riskProfile) {
    const key = normalizeRiskProfile(riskProfile);
    const arr = config.risk_map[key] || config.risk_map.BALANCED || [1, 2, 3];
    return new Set(arr);
}

function resolveCompareCapital(client, minSumField, currentSituation) {
    if (minSumField === 'none') return null;
    const stockCapital = Number(currentSituation?.stock_capital_context?.stock_total_capital_for_min_sum);
    if (Number.isFinite(stockCapital) && stockCapital > 0) {
        return stockCapital;
    }
    if (minSumField === 'net_worth') {
        const n = currentSituation && currentSituation.net_worth != null ? Number(currentSituation.net_worth) : NaN;
        return Number.isFinite(n) ? n : null;
    }
    const t = client && client.total_liquid_capital != null ? Number(client.total_liquid_capital) : NaN;
    return Number.isFinite(t) ? t : null;
}

/**
 * @param {object} row — элемент из Comon data[] (поля как в API)
 */
function toShowcaseItem(row) {
    if (!row || typeof row !== 'object') return null;
    const id = row.id;
    if (id == null) return null;
    return {
        id: Number(id),
        name: row.name != null ? String(row.name) : '',
        url: row.url != null ? String(row.url) : '',
        min_sum: row.minSum != null ? Number(row.minSum) : null,
        risk_level: row.riskLevel != null ? Number(row.riskLevel) : null,
        profit_365_days_percent: row.profit365Days != null ? Number(row.profit365Days) : null,
        annual_average_profit_percent: row.annualAverageProfit != null ? Number(row.annualAverageProfit) : null,
        follower_count: row.followerCount != null ? Number(row.followerCount) : null,
        strategy_rating: row.strategyRating != null ? Number(row.strategyRating) : null,
        tags: Array.isArray(row.tags) ? row.tags.map((t) => String(t)) : [],
        author: row.author != null ? String(row.author) : null,
        premium: Boolean(row.premium),
    };
}

function resolveManualSourceFilePath() {
    const raw = process.env.COMON_SHOWCASE_SOURCE_FILE;
    if (raw && String(raw).trim()) {
        return path.resolve(process.cwd(), String(raw).trim());
    }
    return MANUAL_SOURCE_DEFAULT;
}

function normalizeManualRows(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === 'object' && Array.isArray(payload.items)) return payload.items;
    throw new Error('Manual Comon showcase source must be array or object with items[]');
}

function loadRowsFromManualSource() {
    const sourcePath = resolveManualSourceFilePath();
    let stat;
    try {
        stat = fs.statSync(sourcePath);
    } catch {
        throw new Error(`Manual Comon showcase source file not found: ${sourcePath}`);
    }
    const raw = fs.readFileSync(sourcePath, 'utf8');
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (e) {
        const msg = e && e.message ? String(e.message) : 'invalid json';
        throw new Error(`Manual Comon showcase source has invalid JSON: ${msg}`);
    }
    const rows = normalizeManualRows(parsed);
    manualSourceMtimeMs = Number(stat.mtimeMs) || Date.now();
    return rows;
}

/**
 * @returns {Promise<object[]>}
 */
async function loadAllListRows(config, projectId) {
    const key = cacheKeyProject(projectId);
    const now = Date.now();
    const hit = listCacheByProject.get(key);

    let dbVersion = 0;
    try {
        dbVersion = await comonRecommendedStrategyRepository.getMaxUpdatedAtMs();
    } catch (e) {
        console.warn('[comonShowcaseService] comon_recommended_strategies:', e.message);
    }

    const sourceFile = resolveManualSourceFilePath();
    const sourceMtimeMs = (() => {
        try {
            return Number(fs.statSync(sourceFile).mtimeMs) || null;
        } catch {
            return null;
        }
    })();
    const sourceFileChanged =
        sourceMtimeMs != null && manualSourceMtimeMs != null && sourceMtimeMs !== manualSourceMtimeMs;

    const dbChanged = hit && hit.dbVersion !== undefined && hit.dbVersion !== dbVersion;

    if (!sourceFileChanged && !dbChanged && hit && hit.expires > now && Array.isArray(hit.rows)) {
        return hit.rows;
    }

    let all = [];
    try {
        all = await comonRecommendedStrategyRepository.listActivePayloadsOrdered();
    } catch (e) {
        console.warn('[comonShowcaseService] DB strategies load failed:', e.message);
    }

    if (!Array.isArray(all) || all.length === 0) {
        all = loadRowsFromManualSource();
    }

    listCacheByProject.set(key, {
        expires: now + config.cache_ttl_ms,
        rows: all,
        dbVersion,
    });
    return all;
}

function filterAndRank(rows, config, client, currentSituation) {
    const riskSet = allowedRiskLevels(config, client && client.risk_profile);
    const capital = resolveCompareCapital(client, config.min_sum_field, currentSituation);

    let list = rows.filter((r) => {
        if (config.exclude_archived && r.archivedAt != null) return false;
        if (config.require_tags.length > 0) {
            const tags = Array.isArray(r.tags) ? r.tags.map((t) => String(t)) : [];
            const ok = config.require_tags.some((req) => tags.includes(req));
            if (!ok) return false;
        }
        if (r.riskLevel != null && riskSet.size > 0) {
            const rl = Number(r.riskLevel);
            if (Number.isFinite(rl) && !riskSet.has(rl)) return false;
        }
        if (capital != null && Number.isFinite(capital) && r.minSum != null) {
            const minS = Number(r.minSum);
            if (Number.isFinite(minS) && minS > capital) return false;
        }
        return true;
    });

    list.sort((a, b) => {
        const ya = a.profit365Days != null ? Number(a.profit365Days) : -Infinity;
        const yb = b.profit365Days != null ? Number(b.profit365Days) : -Infinity;
        if (yb !== ya) return yb - ya;
        const ra = a.strategyRating != null ? Number(a.strategyRating) : -Infinity;
        const rb = b.strategyRating != null ? Number(b.strategyRating) : -Infinity;
        if (rb !== ra) return rb - ra;
        const pa = a.annualAverageProfit != null ? Number(a.annualAverageProfit) : -Infinity;
        const pb = b.annualAverageProfit != null ? Number(b.annualAverageProfit) : -Infinity;
        return pb - pa;
    });

    list = list.slice(0, config.max_items);
    return list.map(toShowcaseItem).filter(Boolean);
}

class ComonShowcaseService {
    /**
     * @param {object} client — строка клиента (getFullClient)
     * @param {number|null} projectId
     * @param {object} [currentSituation] — current_situation из отчёта (net_worth)
     * @returns {Promise<null|object>}
     */
    async buildForClient(client, projectId, currentSituation = null) {
        if (!projectId || !client) return null;

        const project = await projectRepository.findById(projectId);
        const config = getComonShowcaseConfigFromProject(project);
        if (!config) return null;

        try {
            const rawRows = await loadAllListRows(config, projectId);
            const items = filterAndRank(rawRows, config, client, currentSituation);
            return {
                enabled: true,
                generated_at: new Date().toISOString(),
                disclaimer_ru: DISCLAIMER_RU,
                client_risk_profile_used: normalizeRiskProfile(client.risk_profile),
                items,
                definitions: {
                    items:
                        'Карточки стратегий из БД (table comon_recommended_strategies, полный payload из Comon); при пустой таблице — fallback на JSON-файл. Отбор по настройкам проекта и профилю клиента.',
                },
            };
        } catch (e) {
            const msg = e && e.message ? String(e.message) : 'Comon showcase failed';
            console.warn('[comonShowcaseService]', msg);
            return {
                enabled: true,
                error: true,
                error_code: e && e.comonHttpStatus === 403 ? 'COMON_FORBIDDEN' : 'COMON_UPSTREAM',
                message: msg,
                comon_http_status: e && e.comonHttpStatus != null ? e.comonHttpStatus : undefined,
                generated_at: new Date().toISOString(),
                disclaimer_ru: DISCLAIMER_RU,
                items: [],
            };
        }
    }
}

module.exports = {
    comonShowcaseService: new ComonShowcaseService(),
    DISCLAIMER_RU,
};
