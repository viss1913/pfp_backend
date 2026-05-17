/**
 * Agent LK news feed query.
 */

const db = require('../../config/database');
const { config } = require('./newsConfig');
const { EXTENDED_EVENT_TYPES } = require('./newsIngestService');

/**
 * @param {number} limit
 * @returns {number}
 */
function clampLimit(limit) {
    const n = parseInt(limit, 10);
    if (!Number.isFinite(n)) return config.feedDefaultLimit;
    return Math.min(10, Math.max(1, n));
}

/**
 * @param {number} hours
 * @returns {number}
 */
function clampHours(hours) {
    const n = parseInt(hours, 10);
    if (!Number.isFinite(n)) return config.feedDefaultHours;
    return Math.min(168, Math.max(1, n));
}

/**
 * @param {object} row
 * @returns {object}
 */
function mapFeedItem(row) {
    let tags = [];
    let alsoReportedBy = [];
    try {
        if (row.tags_json) {
            tags = typeof row.tags_json === 'string' ? JSON.parse(row.tags_json) : row.tags_json;
        }
        if (row.also_reported_by_json) {
            alsoReportedBy =
                typeof row.also_reported_by_json === 'string'
                    ? JSON.parse(row.also_reported_by_json)
                    : row.also_reported_by_json;
        }
    } catch (_) {
        /* ignore */
    }

    return {
        id: row.id,
        title: row.title,
        description: row.description || null,
        url: row.url,
        source: {
            slug: row.source_slug,
            name: row.source_name,
        },
        publishedAt: row.published_at instanceof Date ? row.published_at.toISOString() : row.published_at,
        eventType: row.event_type,
        score: row.score,
        tags: Array.isArray(tags) ? tags : [],
        agentTakeaway: row.agent_takeaway || null,
        alsoReportedBy: Array.isArray(alsoReportedBy) ? alsoReportedBy : [],
        read: Boolean(row.read_at),
    };
}

/**
 * @param {{ limit?: number; hours?: number; eventType?: string; agentId?: number }} opts
 */
async function getFeed(opts = {}) {
    const limit = clampLimit(opts.limit ?? config.feedDefaultLimit);
    const hours = clampHours(opts.hours ?? config.feedDefaultHours);
    const extendedCutoff = new Date(Date.now() - config.feedExtendedHours * 3600 * 1000);
    const defaultCutoff = new Date(Date.now() - hours * 3600 * 1000);

    let q = db('news_articles as a')
        .join('news_sources as s', 's.id', 'a.source_id')
        .where('a.status', 'published')
        .where('a.score', '>=', config.publishScoreMin)
        .select(
            'a.*',
            's.slug as source_slug',
            's.name as source_name'
        );

    if (opts.eventType) {
        q = q.where('a.event_type', opts.eventType);
    }

    q = q.where(function () {
        this.where('a.published_at', '>=', defaultCutoff).orWhere(function () {
            this.where('a.published_at', '>=', extendedCutoff).whereIn(
                'a.event_type',
                [...EXTENDED_EVENT_TYPES]
            );
        });
    });

    if (opts.agentId) {
        q = q.leftJoin('agent_news_reads as r', function () {
            this.on('r.article_id', '=', 'a.id').andOn('r.agent_id', '=', db.raw('?', [opts.agentId]));
        });
        q = q.select('r.read_at');
    }

    const rows = await q.orderBy('a.score', 'desc').orderBy('a.published_at', 'desc').limit(limit * 3);

    const seenClusters = new Set();
    const items = [];
    for (const row of rows) {
        const key = row.cluster_key || `id:${row.id}`;
        if (seenClusters.has(key)) continue;
        seenClusters.add(key);
        items.push(mapFeedItem(row));
        if (items.length >= limit) break;
    }

    const quiet = items.length === 0;

    return {
        success: true,
        generatedAt: new Date().toISOString(),
        quiet,
        message: quiet
            ? `За последние ${hours} ч. нет значимых событий по выбранным критериям.`
            : null,
        filters: {
            limit,
            hours,
            minScore: config.publishScoreMin,
            eventType: opts.eventType || null,
        },
        items,
    };
}

/**
 * @param {number} agentId
 * @param {number} articleId
 */
async function markRead(agentId, articleId) {
    const article = await db('news_articles').where({ id: articleId, status: 'published' }).first();
    if (!article) return null;

    await db('agent_news_reads')
        .insert({
            agent_id: agentId,
            article_id: articleId,
            read_at: db.fn.now(),
        })
        .onConflict(['agent_id', 'article_id'])
        .merge({ read_at: db.fn.now() });

    return { success: true, articleId };
}

module.exports = {
    getFeed,
    markRead,
    clampLimit,
    clampHours,
};
