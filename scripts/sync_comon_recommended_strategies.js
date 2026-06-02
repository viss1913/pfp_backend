/**
 * Синхронизация рекомендованных стратегий Comon в БД (cron на immers).
 *
 *   node scripts/sync_comon_recommended_strategies.js
 *
 * Env: COMON_STRATEGIES_LIST_PATH=/api/v2/strategies/?tags=recommended (рекомендуется на immers)
 */
const comonService = require('../src/services/comonService');

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 3;
const RECOMMENDED_STRATEGIES_PATH = '/api/v2/strategies';
const RECOMMENDED_TAG = 'recommended';

function pageSizeFromEnv() {
    const n = Number(process.env.COMON_SYNC_PAGE_SIZE);
    return Number.isFinite(n) && n >= 10 && n <= 200 ? Math.floor(n) : DEFAULT_PAGE_SIZE;
}

function maxPagesFromEnv() {
    const n = Number(process.env.COMON_SYNC_MAX_PAGES);
    return Number.isFinite(n) && n >= 1 && n <= 20 ? Math.floor(n) : DEFAULT_MAX_PAGES;
}

async function fetchAllRecommended() {
    const pageSize = pageSizeFromEnv();
    const maxPages = maxPagesFromEnv();
    const all = [];
    let page = 1;

    while (page <= maxPages) {
        const body = await comonService.fetchStrategiesList({
            page,
            pageSize,
            path: RECOMMENDED_STRATEGIES_PATH,
            tags: RECOMMENDED_TAG,
        });
        const chunk = Array.isArray(body?.data) ? body.data : [];
        all.push(...chunk);

        const totalPages = Number(body?.paging?.totalPages);
        if (Number.isFinite(totalPages) && totalPages > maxPages) {
            throw new Error(
                `Comon recommended catalog requires ${totalPages} pages, but COMON_SYNC_MAX_PAGES=${maxPages}. Refusing partial replace.`
            );
        }
        const hasMoreByPaging = Number.isFinite(totalPages) && totalPages > 0
            ? page < totalPages
            : chunk.length >= pageSize;

        console.log(
            `[comon_sync] page=${page} fetched=${chunk.length} total_so_far=${all.length}` +
                (Number.isFinite(totalPages) ? ` totalPages=${totalPages}` : '')
        );

        if (!hasMoreByPaging || chunk.length === 0) break;
        page += 1;
    }

    return all;
}

async function replaceCatalog(items) {
    const db = require('../src/config/database');
    const now = new Date();
    const rows = items
        .map((item, i) => {
            const id = item && item.id != null ? Number(item.id) : NaN;
            if (!Number.isFinite(id) || id <= 0) return null;
            return {
                comon_strategy_id: id,
                payload: item,
                sort_order: i,
                is_active: true,
                created_at: now,
                updated_at: now,
            };
        })
        .filter(Boolean);

    await db.transaction(async (trx) => {
        await trx('comon_recommended_strategies').del();
        if (rows.length > 0) {
            await trx.batchInsert('comon_recommended_strategies', rows, 50);
        }
    });

    return rows.length;
}

async function main() {
    console.log('[comon_sync] start', {
        path: RECOMMENDED_STRATEGIES_PATH,
        tags: RECOMMENDED_TAG,
        pageSize: pageSizeFromEnv(),
        maxPages: maxPagesFromEnv(),
    });

    let items;
    try {
        items = await fetchAllRecommended();
    } catch (e) {
        const status = e && e.comonHttpStatus != null ? e.comonHttpStatus : 'n/a';
        console.error('[comon_sync] upstream failed', { status, message: e && e.message ? e.message : e });
        process.exit(1);
    }

    if (!Array.isArray(items) || items.length === 0) {
        console.error('[comon_sync] empty catalog from Comon — aborting without DB replace');
        process.exit(1);
    }

    const saved = await replaceCatalog(items);
    console.log('[comon_sync] OK: replaced catalog with', saved, 'rows');
    process.exit(0);
}

if (require.main === module) {
    main().catch((e) => {
        console.error('[comon_sync] fatal', e);
        process.exit(1);
    });
}

module.exports = {
    RECOMMENDED_STRATEGIES_PATH,
    RECOMMENDED_TAG,
    fetchAllRecommended,
    main,
    pageSizeFromEnv,
    maxPagesFromEnv,
};
