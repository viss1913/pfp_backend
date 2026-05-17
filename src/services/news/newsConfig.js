/**
 * News feed configuration from environment.
 */

const EVENT_TYPES = [
    'RATE_CHANGE',
    'INFLATION',
    'SANCTIONS',
    'TAX_CHANGE',
    'OIL',
    'BANKING',
    'STOCK_MARKET',
    'CURRENCY',
    'OTHER',
];

function envInt(name, fallback) {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return fallback;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : fallback;
}

function envBool(name, fallback) {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return fallback;
    return raw === '1' || raw.toLowerCase() === 'true';
}

const config = {
    enabled: envBool('NEWS_ENABLED', true),
    cron: process.env.NEWS_CRON || '*/15 * * * *',
    storeScoreMin: envInt('NEWS_STORE_SCORE_MIN', 25),
    publishScoreMin: envInt('NEWS_PUBLISH_SCORE_MIN', 60),
    feedDefaultLimit: envInt('NEWS_FEED_DEFAULT_LIMIT', 7),
    feedDefaultHours: envInt('NEWS_FEED_DEFAULT_HOURS', 48),
    feedExtendedHours: envInt('NEWS_FEED_EXTENDED_HOURS', 72),
    httpTimeoutMs: envInt('NEWS_HTTP_TIMEOUT_MS', 15000),
    providerDelayMs: envInt('NEWS_PROVIDER_DELAY_MS', 2500),
};

module.exports = {
    EVENT_TYPES,
    config,
};
