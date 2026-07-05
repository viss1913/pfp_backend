/**
 * B2C client invite URL — landing root (not agent /register/).
 */

const DEFAULT_CLIENT_LANDING_BASE = 'https://family-office.bank-future.com/';

function getClientLandingBaseUrl() {
    return (
        process.env.CLIENT_LANDING_BASE_URL ||
        process.env.FRONTEND_CLIENT_LANDING_URL ||
        DEFAULT_CLIENT_LANDING_BASE
    ).trim();
}

/**
 * @param {{ baseUrl?: string, projectPublicKey: string, referralRef: string, inviterPartnerAgentId?: string|null, paramOverrides?: object }} opts
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

    const projectKey = String(opts.projectPublicKey || '').trim();
    if (projectKey) {
        url.searchParams.set('project_key', projectKey);
    }

    const ref = String(opts.referralRef || '').trim();
    if (ref) {
        url.searchParams.set('ref', ref);
    }

    const params = {
        utm_source: 'pfp',
        utm_medium: 'agent_client_invite',
        utm_campaign: 'b2c_register',
        ...(opts.paramOverrides && typeof opts.paramOverrides === 'object' ? opts.paramOverrides : {}),
    };

    const inviterId =
        opts.inviterPartnerAgentId != null && String(opts.inviterPartnerAgentId).trim() !== ''
            ? String(opts.inviterPartnerAgentId).trim()
            : null;
    if (inviterId) {
        params.utm_partner_finam = inviterId;
    }

    for (const [key, value] of Object.entries(params)) {
        if (value == null || value === '') continue;
        url.searchParams.set(key, String(value));
    }

    return url.toString();
}

module.exports = {
    DEFAULT_CLIENT_LANDING_BASE,
    getClientLandingBaseUrl,
    buildClientLandingInviteUrl,
};
