/**
 * Generic RSS/Atom fetch and parse.
 */

const axios = require('axios');
const { parseStringPromise } = require('xml2js');
const { config } = require('./newsConfig');
const { externalIdFromUrl } = require('./newsDedupService');

/**
 * @param {unknown} val
 * @returns {string|undefined}
 */
function firstString(val) {
    if (val == null) return undefined;
    if (typeof val === 'string') return val;
    if (Array.isArray(val)) return firstString(val[0]);
    if (typeof val === 'object' && val._ != null) return String(val._);
    if (typeof val === 'object' && val['#text'] != null) return String(val['#text']);
    return undefined;
}

/**
 * @param {unknown} val
 * @returns {Date}
 */
function parseDate(val) {
    const s = firstString(val);
    if (!s) return new Date();
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? new Date() : d;
}

/**
 * Strip HTML tags from description.
 * @param {string} [html]
 * @returns {string}
 */
function stripHtml(html) {
    if (!html) return '';
    return String(html)
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 2000);
}

/**
 * @param {Record<string, unknown>} item
 * @returns {{ title: string; description: string; url: string; publishedAt: Date; externalId: string }|null}
 */
function mapRssItem(item) {
    const title = firstString(item.title);
    const link = firstString(item.link) || firstString(item.guid);
    if (!title || !link) return null;

    const description =
        stripHtml(firstString(item.description)) ||
        stripHtml(firstString(item['content:encoded'])) ||
        stripHtml(firstString(item.summary)) ||
        '';

    const publishedAt = parseDate(item.pubDate || item.published || item.updated || item['dc:date']);

    return {
        title: title.trim().slice(0, 512),
        description,
        url: link.trim().slice(0, 768),
        publishedAt,
        externalId: firstString(item.guid) || externalIdFromUrl(link),
    };
}

/**
 * @param {Record<string, unknown>} entry
 * @returns {{ title: string; description: string; url: string; publishedAt: Date; externalId: string }|null}
 */
function mapAtomEntry(entry) {
    const title = firstString(entry.title);
    let link = firstString(entry.id);
    if (entry.link) {
        const links = Array.isArray(entry.link) ? entry.link : [entry.link];
        const alt = links.find((l) => l && l.$ && l.$.rel !== 'self') || links[0];
        if (alt && alt.$ && alt.$.href) link = alt.$.href;
        else if (typeof alt === 'string') link = alt;
    }
    if (!title || !link) return null;

    const description =
        stripHtml(firstString(entry.summary)) ||
        stripHtml(firstString(entry.content)) ||
        '';

    const publishedAt = parseDate(entry.published || entry.updated);

    return {
        title: title.trim().slice(0, 512),
        description,
        url: link.trim().slice(0, 768),
        publishedAt,
        externalId: externalIdFromUrl(link),
    };
}

/**
 * @param {string} rssUrl
 * @returns {Promise<Array<{ title: string; description: string; url: string; publishedAt: Date; externalId: string }>>}
 */
async function fetchRssArticles(rssUrl) {
    const response = await axios.get(rssUrl, {
        timeout: config.httpTimeoutMs,
        responseType: 'text',
        headers: {
            'User-Agent': 'PFP-NewsBot/1.0 (+https://bank-future.com)',
            Accept: 'application/rss+xml, application/xml, text/xml, */*',
        },
        maxRedirects: 5,
        validateStatus: (s) => s >= 200 && s < 400,
    });

    const parsed = await parseStringPromise(response.data, {
        explicitArray: false,
        trim: true,
    });

    const items = [];

    if (parsed?.rss?.channel?.item) {
        const raw = parsed.rss.channel.item;
        const list = Array.isArray(raw) ? raw : [raw];
        for (const item of list) {
            const mapped = mapRssItem(item);
            if (mapped) items.push(mapped);
        }
    }

    if (parsed?.feed?.entry) {
        const raw = parsed.feed.entry;
        const list = Array.isArray(raw) ? raw : [raw];
        for (const entry of list) {
            const mapped = mapAtomEntry(entry);
            if (mapped) items.push(mapped);
        }
    }

    return items;
}

module.exports = {
    fetchRssArticles,
    stripHtml,
};
