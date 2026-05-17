/**
 * Title normalization and cluster keys for deduplication.
 */

const crypto = require('crypto');

const STOP_WORDS = new Set([
    'сообщил',
    'сообщили',
    'заявил',
    'заявили',
    'передает',
    'передают',
    'по',
    'данным',
    'источник',
    'рбк',
    'тасс',
    'интерфакс',
]);

/**
 * @param {string} title
 * @returns {string}
 */
function normalizeTitle(title) {
    let t = String(title || '')
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[«»"'""]/g, ' ')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const words = t
        .split(' ')
        .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

    return words.slice(0, 12).join(' ');
}

/**
 * @param {string} title
 * @param {Date} publishedAt
 * @returns {string}
 */
function buildClusterKey(title, publishedAt) {
    const norm = normalizeTitle(title);
    const d = publishedAt instanceof Date ? publishedAt : new Date(publishedAt);
    const day = d.toISOString().slice(0, 10);
    return crypto.createHash('sha256').update(`${norm}|${day}`).digest('hex');
}

/**
 * @param {string} url
 * @returns {string}
 */
function externalIdFromUrl(url) {
    return crypto.createHash('sha256').update(String(url || '')).digest('hex').slice(0, 64);
}

module.exports = {
    normalizeTitle,
    buildClusterKey,
    externalIdFromUrl,
};
