const DEFAULT_ACTIVATE_BASE = 'https://pfp-front-ver3.vercel.app/invite/activate';

function getFamilyOfficeActivateBaseUrl() {
    return (process.env.AGENT_INVITE_ACTIVATE_BASE_URL || DEFAULT_ACTIVATE_BASE).trim();
}

function getInviteTokenTtlDays() {
    const n = Number(process.env.AGENT_INVITE_TOKEN_TTL_DAYS);
    return Number.isFinite(n) && n > 0 ? n : 7;
}

/**
 * @param {{ token: string, baseUrl?: string }} opts
 * @returns {string}
 */
function buildFamilyOfficeActivateUrl(opts = {}) {
    const token = String(opts.token || '').trim();
    if (!token) return '';

    const baseRaw = (opts.baseUrl != null ? String(opts.baseUrl) : getFamilyOfficeActivateBaseUrl()).trim();
    let url;
    try {
        url = new URL(baseRaw);
    } catch (_) {
        return `${baseRaw}${baseRaw.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
    }
    url.searchParams.set('token', token);
    return url.toString();
}

module.exports = {
    DEFAULT_ACTIVATE_BASE,
    getFamilyOfficeActivateBaseUrl,
    getInviteTokenTtlDays,
    buildFamilyOfficeActivateUrl,
};
