/**
 * Нормализация публичных полей стратегии из __NEXT_DATA__ Comon.
 * Структура Next.js не контрактная — при смене вёрстки fields может стать null.
 */

const SCHEMA_VERSION = 1;

/**
 * @param {object|null|undefined} obj
 * @returns {object|null}
 */
function pickStrategyFields(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    const keys = [
        'id',
        'name',
        'description',
        'shortDescription',
        'summary',
        'tags',
        'riskLevel',
        'minSum',
        'author',
        'premium',
        'archivedAt',
        'profit365Days',
        'annualAverageProfit',
        'strategyRating',
        'url',
    ];
    const out = {};
    for (const k of keys) {
        if (obj[k] === undefined || obj[k] === null) continue;
        const v = obj[k];
        if (typeof v === 'object' && !Array.isArray(v) && k !== 'tags') continue;
        out[k] = v;
    }
    return Object.keys(out).length ? out : null;
}

/**
 * @param {object|null|undefined} pageProps
 * @returns {object|null}
 */
function findStrategyInPageProps(pageProps) {
    if (!pageProps || typeof pageProps !== 'object') return null;

    const directKeys = ['strategy', 'strategyData', 'initialStrategy', 'strategyPage'];
    for (const k of directKeys) {
        const v = pageProps[k];
        const picked = pickStrategyFields(v);
        if (picked) return picked;
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            const inner = v.strategy != null ? v.strategy : v.data;
            const p2 = pickStrategyFields(inner);
            if (p2) return p2;
        }
    }
    return null;
}

/**
 * @param {string} strategyId
 * @param {object|null|undefined} nextData — результат extractNextData(html)
 * @returns {{ strategyId: string, schema_version: number, has_next_data: boolean, page_props_keys: string[], fields: object|null }}
 */
function normalizeStrategyDetailsFromNextData(strategyId, nextData) {
    const base = {
        strategyId: String(strategyId),
        schema_version: SCHEMA_VERSION,
        has_next_data: Boolean(nextData && typeof nextData === 'object'),
        page_props_keys: [],
        fields: null,
    };

    if (!nextData || typeof nextData !== 'object') {
        return base;
    }

    const pp = nextData.props && nextData.props.pageProps;
    if (pp && typeof pp === 'object') {
        base.page_props_keys = Object.keys(pp).slice(0, 80);
    }

    const fields = findStrategyInPageProps(pp);
    if (fields) {
        base.fields = fields;
    }

    return base;
}

module.exports = {
    normalizeStrategyDetailsFromNextData,
    SCHEMA_VERSION,
};
