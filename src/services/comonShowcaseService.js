const comonService = require('./comonService');
const projectRepository = require('../repositories/projectRepository');
const { getComonShowcaseConfigFromProject } = require('../utils/projectComonShowcaseSettings');

const DISCLAIMER_RU =
    'Информация носит ознакомительный характер и не является индивидуальной инвестиционной рекомендацией. ' +
    'Доходность в прошлом не гарантирует доходность в будущем. Условия стратегий на стороне оператора (Comon) могут меняться. ' +
    'Подбор стратегий на экране выполняется автоматически по общим критериям (в т.ч. риск-профиль и минимальная сумма) и не заменяет консультацию.';

/** @type {Map<string, { expires: number, rows: object[] }>} */
const listCacheByProject = new Map();

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
    if (minSumField === 'net_worth') {
        const n = currentSituation && currentSituation.net_worth != null ? Number(currentSituation.net_worth) : NaN;
        return Number.isFinite(n) ? n : null;
    }
    const t = client && client.total_liquid_capital != null ? Number(client.total_liquid_capital) : NaN;
    return Number.isFinite(t) ? t : null;
}

/**
 * @param {object} row — элемент из Comon data[]
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
        strategy_rating: row.strategyRating != null ? Number(row.strategyRating) : null,
        tags: Array.isArray(row.tags) ? row.tags.map((t) => String(t)) : [],
        author: row.author != null ? String(row.author) : null,
        premium: Boolean(row.premium),
    };
}

async function loadAllListRows(config, projectId) {
    const key = cacheKeyProject(projectId);
    const now = Date.now();
    const hit = listCacheByProject.get(key);
    if (hit && hit.expires > now && Array.isArray(hit.rows)) {
        return hit.rows;
    }

    const all = [];
    let totalPages = 1;
    for (let page = 1; page <= config.max_list_pages; page += 1) {
        const chunk = await comonService.fetchStrategiesList({
            page,
            pageSize: config.list_page_size,
        });
        const rows = Array.isArray(chunk.data) ? chunk.data : [];
        all.push(...rows);
        const p = chunk.paging;
        if (p && Number(p.totalPages) > 0) {
            totalPages = Number(p.totalPages);
        }
        if (page >= totalPages) break;
    }

    listCacheByProject.set(key, {
        expires: now + config.cache_ttl_ms,
        rows: all,
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
                        'Карточки стратегий с публичного каталога Comon; отбор по настройкам проекта и профилю клиента.',
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
