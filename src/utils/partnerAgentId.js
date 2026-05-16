const knex = require('../config/database');
const { getPartnerAgentIdSettings } = require('./projectSettings');

const PARTNER_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function normalizePartnerAgentId(raw) {
    if (raw == null) return null;
    const s = String(raw).trim();
    if (!s) return null;
    if (!PARTNER_ID_RE.test(s)) {
        throw { status: 400, message: 'Некорректный ID партнёра (1–64 символа: буквы, цифры, -, _)' };
    }
    return s;
}

function parsePartnerAgentIdFromRefUrl(urlString, refParse = {}) {
    if (!urlString || typeof urlString !== 'string') return null;
    let url;
    try {
        url = new URL(urlString.trim());
    } catch (_) {
        throw { status: 400, message: 'Некорректная ссылка партнёра' };
    }

    const params = Array.isArray(refParse.query_params) ? refParse.query_params : [];
    for (const key of params) {
        const v = url.searchParams.get(key);
        if (v && String(v).trim()) {
            return normalizePartnerAgentId(v);
        }
    }

    if (refParse.path_regex) {
        try {
            const re = new RegExp(refParse.path_regex);
            const m = url.pathname.match(re);
            if (m && m[1]) return normalizePartnerAgentId(m[1]);
        } catch (_) {
            /* ignore bad regex */
        }
    }

    return null;
}

/**
 * @param {{ partner_agent_id?: string, partner_ref_url?: string }} input
 * @param {object} projectSettings
 * @returns {string|null}
 */
function parsePartnerAgentIdFromInput(input = {}, projectSettings = {}) {
    const cfg = getPartnerAgentIdSettings(projectSettings);
    const refParse = cfg.ref_parse || {};

    if (input.partner_agent_id != null && String(input.partner_agent_id).trim() !== '') {
        return normalizePartnerAgentId(input.partner_agent_id);
    }

    if (input.partner_ref_url) {
        const fromUrl = parsePartnerAgentIdFromRefUrl(input.partner_ref_url, refParse);
        if (fromUrl) return fromUrl;
        throw {
            status: 400,
            message: 'Не удалось извлечь ID партнёра из ссылки. Введите ID вручную.',
        };
    }

    return null;
}

function isPartnerAgentIdRequired(projectSettings, context) {
    const cfg = getPartnerAgentIdSettings(projectSettings);
    if (context === 'admin_create') return cfg.require_on_admin_create === true;
    if (context === 'registration') return cfg.require_on_registration === true;
    if (context === 'full_access') return cfg.require_for_full_access === true;
    return false;
}

async function assertPartnerAgentIdAvailable(projectId, partnerAgentId, excludeAgentId = null) {
    if (!partnerAgentId) return;
    const q = knex('agents')
        .where({ project_id: projectId, partner_agent_id: partnerAgentId })
        .first();
    if (excludeAgentId != null) {
        q.whereNot('id', excludeAgentId);
    }
    const row = await q;
    if (row) {
        throw { status: 409, message: 'Агент с таким ID партнёра уже зарегистрирован в проекте' };
    }
}

module.exports = {
    normalizePartnerAgentId,
    parsePartnerAgentIdFromRefUrl,
    parsePartnerAgentIdFromInput,
    isPartnerAgentIdRequired,
    assertPartnerAgentIdAvailable,
};
