/**
 * B2C client invite URL — landing root (not agent /register/).
 * Короткая ссылка: только ?ref={referral_slug}. project_key и UTM — через preview/регистрацию.
 *
 * База: agents.website_url (если валидный http/https), иначе env CLIENT_LANDING_BASE_URL.
 * Для дефолтного лендинга путь — CLIENT_INVITE_LANDING_PATH (/plan).
 * Для сайта агента pathname из website_url сохраняется (не форсим /plan).
 */

const DEFAULT_CLIENT_LANDING_BASE = 'https://family-office.bank-future.com/';

function getClientLandingBaseUrl() {
    return (
        process.env.CLIENT_LANDING_BASE_URL ||
        process.env.FRONTEND_CLIENT_LANDING_URL ||
        DEFAULT_CLIENT_LANDING_BASE
    ).trim();
}

function getClientInviteLandingPath() {
    const raw = String(process.env.CLIENT_INVITE_LANDING_PATH || '/plan').trim();
    if (!raw || raw === '/') return '/plan';
    return raw.startsWith('/') ? raw.replace(/\/+$/, '') || '/plan' : `/${raw.replace(/\/+$/, '')}`;
}

/**
 * Normalize agent profile website for use as invite base.
 * Accepts absolute http(s) or host without scheme (https:// prepended).
 * Keeps pathname; strips search/hash. Returns null if unusable.
 * @param {unknown} raw
 * @returns {string|null}
 */
function normalizeAgentWebsiteUrl(raw) {
    if (raw == null) return null;
    let s = String(raw).trim();
    if (!s) return null;

    // Reject non-http(s) schemes (ftp:, javascript:, etc.) before prepending https.
    if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^https?:\/\//i.test(s)) {
        return null;
    }
    if (!/^https?:\/\//i.test(s)) {
        s = `https://${s}`;
    }

    let url;
    try {
        url = new URL(s);
    } catch (_) {
        return null;
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname || url.hostname.includes(' ')) return null;

    url.search = '';
    url.hash = '';
    return url.toString();
}

/**
 * @param {{ baseUrl?: string, referralRef: string, landingPath?: string|null, preservePath?: boolean }} opts
 * @returns {string}
 */
function buildClientLandingInviteUrl(opts = {}) {
    const baseRaw = (opts.baseUrl != null ? String(opts.baseUrl) : getClientLandingBaseUrl()).trim();
    if (!baseRaw) return '';

    let url;
    try {
        url = new URL(baseRaw);
    } catch (_) {
        return baseRaw;
    }

    const preservePath = opts.preservePath === true;
    if (!preservePath) {
        const landingPath = opts.landingPath != null ? opts.landingPath : getClientInviteLandingPath();
        if (landingPath) {
            url.pathname = landingPath;
        }
    }

    const ref = String(opts.referralRef || '').trim();
    url.search = '';
    if (ref) {
        url.searchParams.set('ref', ref);
    }

    return url.toString();
}

/**
 * Resolve invite URL for an agent: personal website if set, else default FO landing.
 * @param {{ referralRef: string, websiteUrl?: string|null }} opts
 * @returns {{ url: string, uses_agent_website: boolean, website_url: string|null }}
 */
function buildAgentClientInviteUrl(opts = {}) {
    const referralRef = String(opts.referralRef || '').trim();
    const websiteUrl = normalizeAgentWebsiteUrl(opts.websiteUrl);

    if (websiteUrl) {
        return {
            url: buildClientLandingInviteUrl({
                baseUrl: websiteUrl,
                referralRef,
                preservePath: true,
            }),
            uses_agent_website: true,
            website_url: websiteUrl,
        };
    }

    return {
        url: buildClientLandingInviteUrl({ referralRef }),
        uses_agent_website: false,
        website_url: null,
    };
}

module.exports = {
    DEFAULT_CLIENT_LANDING_BASE,
    getClientLandingBaseUrl,
    getClientInviteLandingPath,
    normalizeAgentWebsiteUrl,
    buildClientLandingInviteUrl,
    buildAgentClientInviteUrl,
};
