/**
 * Registration invite URL for subagents (our frontend; not Finam domain whitelist).
 */

const DEFAULT_REGISTER_BASE =
    'https://family-office.bank-future.com/register';

function getAgentRegisterBaseUrl() {
    return (
        process.env.AGENT_REGISTER_BASE_URL ||
        process.env.FRONTEND_AGENT_REGISTER_URL ||
        DEFAULT_REGISTER_BASE
    ).trim();
}

/**
 * @param {{ baseUrl?: string, projectPublicKey: string, referralRef: string, inviterPartnerAgentId?: string|null, paramOverrides?: object }} opts
 * @returns {string}
 */
function buildAgentRegistrationInviteUrl(opts = {}) {
    const baseRaw = (opts.baseUrl != null ? String(opts.baseUrl) : getAgentRegisterBaseUrl()).trim();
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
        utm_medium: 'agent_invite_email',
        utm_campaign: 'subagent_register',
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
    DEFAULT_REGISTER_BASE,
    getAgentRegisterBaseUrl,
    buildAgentRegistrationInviteUrl,
};
