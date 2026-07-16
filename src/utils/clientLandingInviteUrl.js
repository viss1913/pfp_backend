/**
 * B2C client invite URL — landing root (not agent /register/).
 * Короткая ссылка: только ?ref={referral_slug}. project_key и UTM — через preview/регистрацию.
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
 * @param {{ baseUrl?: string, referralRef: string, landingPath?: string }} opts
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

    const landingPath = opts.landingPath != null ? opts.landingPath : getClientInviteLandingPath();
    if (landingPath) {
        url.pathname = landingPath;
    }

    const ref = String(opts.referralRef || '').trim();
    url.search = '';
    if (ref) {
        url.searchParams.set('ref', ref);
    }

    return url.toString();
}

module.exports = {
    DEFAULT_CLIENT_LANDING_BASE,
    getClientLandingBaseUrl,
    getClientInviteLandingPath,
    buildClientLandingInviteUrl,
};
