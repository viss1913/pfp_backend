/**
 * RSS ingest, scoring, deduplication, persistence.
 */

const db = require('../../config/database');
const { config } = require('./newsConfig');
const { fetchRssArticles } = require('./rssFetchService');
const { scoreArticle } = require('./newsScoringService');
const { buildClusterKey } = require('./newsDedupService');

const EXTENDED_EVENT_TYPES = new Set(['TAX_CHANGE', 'SANCTIONS']);

/**
 * @param {number} score
 * @param {string} eventType
 * @param {string} [rejectReason]
 * @returns {'rejected'|'published'|'candidate'}
 */
function resolveStatus(score, eventType, rejectReason) {
    if (rejectReason) return 'rejected';
    if (score < config.storeScoreMin) return 'rejected';
    if (score >= config.publishScoreMin) return 'published';
    return 'candidate';
}

/**
 * @param {unknown} json
 * @returns {string[]}
 */
function parseAlsoReported(json) {
    if (!json) return [];
    try {
        const arr = typeof json === 'string' ? JSON.parse(json) : json;
        return Array.isArray(arr) ? arr : [];
    } catch (_) {
        return [];
    }
}

/**
 * @param {object} row
 */
async function upsertArticle(row) {
    const tagsJson = row.tags?.length ? JSON.stringify(row.tags) : null;

    const payload = {
        source_id: row.source_id,
        external_id: row.external_id,
        title: row.title,
        description: row.description || null,
        url: row.url,
        published_at: row.published_at,
        fetched_at: db.fn.now(),
        event_type: row.event_type,
        score: row.score,
        status: row.status,
        cluster_key: row.cluster_key,
        agent_takeaway: row.agent_takeaway,
        tags_json: tagsJson,
        updated_at: db.fn.now(),
    };

    const existingByUrl = await db('news_articles').where({ url: row.url }).first();
    if (existingByUrl) {
        await db('news_articles').where({ id: existingByUrl.id }).update(payload);
        return { action: 'updated', id: existingByUrl.id };
    }

    const existingByExt = await db('news_articles')
        .where({ source_id: row.source_id, external_id: row.external_id })
        .first();
    if (existingByExt) {
        await db('news_articles').where({ id: existingByExt.id }).update(payload);
        return { action: 'updated', id: existingByExt.id };
    }

    if (row.cluster_key) {
        const clusterPeer = await db('news_articles')
            .where({ cluster_key: row.cluster_key })
            .whereIn('status', ['published', 'candidate'])
            .orderBy('score', 'desc')
            .first();

        if (clusterPeer) {
            const peerSource = await db('news_sources').where({ id: clusterPeer.source_id }).first();
            const peerSourceName = peerSource?.name || 'Источник';
            const mergedAlso = parseAlsoReported(clusterPeer.also_reported_by_json);

            if ((row.score || 0) > (clusterPeer.score || 0)) {
                mergedAlso.push(peerSourceName);
                await db('news_articles').where({ id: clusterPeer.id }).update({
                    ...payload,
                    also_reported_by_json: JSON.stringify([...new Set(mergedAlso.filter(Boolean))]),
                });
                return { action: 'cluster_replaced', id: clusterPeer.id };
            }

            mergedAlso.push(row.source_name);
            await db('news_articles').where({ id: clusterPeer.id }).update({
                also_reported_by_json: JSON.stringify([...new Set(mergedAlso.filter(Boolean))]),
                updated_at: db.fn.now(),
            });
            return { action: 'cluster_merged', id: clusterPeer.id };
        }
    }

    const [id] = await db('news_articles').insert({
        ...payload,
        also_reported_by_json: null,
        created_at: db.fn.now(),
    });
    return { action: 'inserted', id };
}

/**
 * @param {object} source
 * @returns {Promise<{ fetched: number; published: number; rejected: number; errors: string[] }>}
 */
async function ingestSource(source) {
    const stats = { fetched: 0, published: 0, rejected: 0, errors: [] };

    let items;
    try {
        items = await fetchRssArticles(source.rss_url);
    } catch (err) {
        stats.errors.push(`${source.slug}: ${err.message}`);
        return stats;
    } finally {
        await db('news_sources').where({ id: source.id }).update({ last_fetched_at: db.fn.now() });
    }

    stats.fetched = items.length;

    for (const item of items) {
        const scored = scoreArticle({
            title: item.title,
            description: item.description,
            trustWeight: source.trust_weight,
            publishedAt: item.publishedAt,
        });

        const status = resolveStatus(scored.score, scored.eventType, scored.rejectReason);
        if (status === 'rejected') {
            stats.rejected += 1;
            continue;
        }

        if (status === 'published') stats.published += 1;

        const clusterKey = buildClusterKey(item.title, item.publishedAt);

        await upsertArticle({
            source_id: source.id,
            external_id: String(item.externalId).slice(0, 128),
            title: item.title,
            description: item.description,
            url: item.url,
            published_at: item.publishedAt,
            event_type: scored.eventType,
            score: scored.score,
            status,
            cluster_key: clusterKey,
            agent_takeaway: scored.agentTakeaway,
            tags: scored.tags,
            source_name: source.name,
        });
    }

    return stats;
}

/**
 * Expire old published articles beyond extended window.
 */
async function expireOldArticles() {
    const hours = Math.max(config.feedDefaultHours, config.feedExtendedHours) + 24;
    const cutoff = new Date(Date.now() - hours * 3600 * 1000);
    await db('news_articles')
        .where('status', 'published')
        .where('published_at', '<', cutoff)
        .update({ status: 'expired', updated_at: db.fn.now() });
}

/**
 * @returns {Promise<{ sources: number; fetched: number; published: number; rejected: number; errors: string[] }>}
 */
async function runIngest() {
    if (!config.enabled) {
        return { sources: 0, fetched: 0, published: 0, rejected: 0, errors: ['NEWS_ENABLED=false'] };
    }

    const sources = await db('news_sources').where({ is_active: true }).orderBy('id');
    const totals = { sources: sources.length, fetched: 0, published: 0, rejected: 0, errors: [] };

    for (let i = 0; i < sources.length; i++) {
        if (i > 0 && config.providerDelayMs > 0) {
            await new Promise((r) => setTimeout(r, config.providerDelayMs));
        }
        const stats = await ingestSource(sources[i]);
        totals.fetched += stats.fetched;
        totals.published += stats.published;
        totals.rejected += stats.rejected;
        totals.errors.push(...stats.errors);
    }

    await expireOldArticles();
    return totals;
}

module.exports = {
    runIngest,
    ingestSource,
    expireOldArticles,
    resolveStatus,
    EXTENDED_EVENT_TYPES,
};
