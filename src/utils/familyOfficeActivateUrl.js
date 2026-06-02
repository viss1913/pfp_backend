/** Trailing slash обязателен: без него nginx/S3 даёт 302 /invite/activate → /invite/activate/ и съедает ?token= */
const DEFAULT_ACTIVATE_BASE = 'https://family-office.bank-future.com/invite/activate/';

function normalizeActivateBaseUrl(baseRaw) {
    const raw = String(baseRaw || '').trim();
    if (!raw) return DEFAULT_ACTIVATE_BASE;
    try {
        const u = new URL(raw);
        if (u.pathname === '/invite/activate' || u.pathname === '/invite/activate/') {
            u.pathname = '/invite/activate/';
        }
        u.search = '';
        u.hash = '';
        let out = u.toString();
        if (!out.endsWith('/') && !u.search) {
            out = `${out}/`;
        }
        return out;
    } catch (_) {
        return raw.endsWith('/') ? raw : `${raw}/`;
    }
}

function deriveActivateBaseFromRegisterUrl(registerBaseRaw) {
    const raw = String(registerBaseRaw || '').trim();
    if (!raw) return '';
    try {
        const u = new URL(raw);
        u.pathname = '/invite/activate/';
        u.search = '';
        u.hash = '';
        return u.toString();
    } catch (_) {
        return '';
    }
}

function getFamilyOfficeActivateBaseUrl() {
    const explicit = (process.env.AGENT_INVITE_ACTIVATE_BASE_URL || '').trim();
    if (explicit) return normalizeActivateBaseUrl(explicit);

    const fromRegister = deriveActivateBaseFromRegisterUrl(
        process.env.AGENT_REGISTER_BASE_URL || process.env.FRONTEND_AGENT_REGISTER_URL
    );
    if (fromRegister) return fromRegister;

    return DEFAULT_ACTIVATE_BASE;
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

    const baseRaw = normalizeActivateBaseUrl(
        opts.baseUrl != null ? String(opts.baseUrl) : getFamilyOfficeActivateBaseUrl()
    );
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
    normalizeActivateBaseUrl,
    deriveActivateBaseFromRegisterUrl,
    getFamilyOfficeActivateBaseUrl,
    getInviteTokenTtlDays,
    buildFamilyOfficeActivateUrl,
};
