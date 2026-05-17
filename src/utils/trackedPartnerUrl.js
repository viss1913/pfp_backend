const { getPartnerLinkTrackingSettings } = require('./projectSettings');

function appendQueryParams(baseUrl, params = {}) {
    const raw = String(baseUrl || '').trim();
    if (!raw) return raw;
    let url;
    try {
        url = new URL(raw);
    } catch (_) {
        return raw;
    }
    for (const [key, value] of Object.entries(params)) {
        if (value == null || value === '') continue;
        url.searchParams.set(key, String(value));
    }
    return url.toString();
}

function hostMatchesWhitelist(hostname, whitelist = []) {
    const host = String(hostname || '').toLowerCase();
    for (const entry of whitelist) {
        const w = String(entry || '').toLowerCase().replace(/^\./, '');
        if (!w) continue;
        if (host === w || host.endsWith(`.${w}`)) return true;
    }
    return false;
}

function inferLinkTypeFromUrl(urlString) {
    const u = String(urlString || '').toLowerCase();
    if (u.includes('comon.ru')) return 'comon';
    if (u.includes('open/order')) return 'broker_open';
    if (u.includes('bonus.finam')) return 'bonus';
    if (u.includes('/landing/agent')) return 'agent_register';
    if (u.includes('vygodniy-perekhod') || u.includes('broker.finam.ru/landing')) return 'transfer';
    if (u.includes('/idu/') || u.includes('funds.finam.ru')) return 'idu';
    if (u.includes('/pds')) return 'pds';
    return 'generic';
}

/**
 * @param {string} baseUrl
 * @param {{ linkType?: string, agent?: object, projectSettings?: object, clientId?: number, paramOverrides?: object }} opts
 */
function buildTrackedPartnerUrl(baseUrl, opts = {}) {
    const raw = String(baseUrl || '').trim();
    if (!raw) return raw;

    const tracking = getPartnerLinkTrackingSettings(opts.projectSettings);
    if (tracking.enabled !== true) return raw;

    const partnerId =
        opts.agent?.partner_agent_id != null && String(opts.agent.partner_agent_id).trim() !== ''
            ? String(opts.agent.partner_agent_id).trim()
            : null;

    let parsed;
    try {
        parsed = new URL(raw);
    } catch (_) {
        return raw;
    }

    const whitelist = Array.isArray(tracking.domain_whitelist) ? tracking.domain_whitelist : [];
    if (whitelist.length && !hostMatchesWhitelist(parsed.hostname, whitelist)) {
        return raw;
    }

    const linkType = opts.linkType || inferLinkTypeFromUrl(raw);
    const defaults = tracking.defaults && typeof tracking.defaults === 'object' ? tracking.defaults : {};
    const perType =
        tracking.per_link_type && typeof tracking.per_link_type === 'object'
            ? tracking.per_link_type
            : {};
    const typeParams = perType[linkType] && typeof perType[linkType] === 'object' ? perType[linkType] : {};

    // Без partner_agent_id — ссылка остаётся базовой, без UTM и без utm_partner_finam.
    if (!partnerId) return raw;

    const overrides =
        opts.paramOverrides && typeof opts.paramOverrides === 'object' ? opts.paramOverrides : {};
    const params = { ...defaults, ...typeParams, ...overrides };

    const agentParam = tracking.agent_id_param || 'utm_partner_finam';
    if (agentParam) {
        params[agentParam] = partnerId;
    }

    if (opts.clientId != null && Number.isFinite(Number(opts.clientId))) {
        params.utm_content = String(opts.clientId);
    }

    return appendQueryParams(raw, params);
}

const HREF_RE = /href=(["'])(https?:\/\/[^"']+)\1/gi;

/**
 * Post-process HTML: track partner URLs in href attributes.
 */
function applyTrackedPartnerUrlsToHtml(html, linkContext = {}) {
    if (!html || linkContext?.enabled !== true) {
        return html;
    }
    return String(html).replace(HREF_RE, (match, quote, url) => {
        const tracked = buildTrackedPartnerUrl(url, {
            agent: linkContext.agent,
            projectSettings: linkContext.projectSettings,
            clientId: linkContext.clientId,
        });
        return `href=${quote}${tracked}${quote}`;
    });
}

module.exports = {
    appendQueryParams,
    buildTrackedPartnerUrl,
    applyTrackedPartnerUrlsToHtml,
    inferLinkTypeFromUrl,
    hostMatchesWhitelist,
};
