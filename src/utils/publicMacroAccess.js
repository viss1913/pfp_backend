/**
 * Публичный снимок макро для лендингов Family Office (гость, без JWT / API key).
 * ПДн нет — те же рыночные ряды, что GET /api/pfp/macro/latest в ЛК агента.
 */

const PUBLIC_MACRO_PATHS = new Set([
    '/api/pfp/macro/public-latest',
    '/api/pfp/macro/latest',
    '/pfp/macro/public-latest',
    '/pfp/macro/latest',
]);

/** Стабильные slug для блока рынка на лендингах FO. */
const LANDING_MACRO_SLUGS = Object.freeze([
    'cbr_key_rate',
    'russia_cpi_inflation_yoy',
    'cbr_deposit_rate_max',
    'moex_ofz_gcurve_5y',
    'moex_imoex',
    'usd_rub',
]);

function normalizeRequestPath(url) {
    return String(url || '').split('?')[0];
}

function isPublicMacroPath(reqOrUrl) {
    if (typeof reqOrUrl === 'string') {
        return PUBLIC_MACRO_PATHS.has(normalizeRequestPath(reqOrUrl));
    }
    const candidates = [
        reqOrUrl && reqOrUrl.originalUrl,
        reqOrUrl && reqOrUrl.url,
        reqOrUrl && reqOrUrl.path,
    ];
    return candidates.some((c) => PUBLIC_MACRO_PATHS.has(normalizeRequestPath(c)));
}

function publicMacroCorsOptions() {
    return {
        origin: '*',
        credentials: false,
        methods: ['GET', 'OPTIONS'],
        allowedHeaders: ['Content-Type'],
        preflightContinue: false,
        optionsSuccessStatus: 204,
    };
}

module.exports = {
    PUBLIC_MACRO_PATHS,
    LANDING_MACRO_SLUGS,
    normalizeRequestPath,
    isPublicMacroPath,
    publicMacroCorsOptions,
};
