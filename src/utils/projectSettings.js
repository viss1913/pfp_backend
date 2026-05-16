/**
 * Parse projects.settings JSON (object or string).
 * @param {object|string|null|undefined} raw
 * @returns {object}
 */
function parseProjectSettings(raw) {
    if (raw == null) return {};
    if (typeof raw === 'object') return raw;
    try {
        const parsed = JSON.parse(String(raw));
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
        return {};
    }
}

function getPartnerAgentIdSettings(settings) {
    const s = parseProjectSettings(settings);
    return s.partner_agent_id && typeof s.partner_agent_id === 'object' ? s.partner_agent_id : {};
}

function getPartnerLinkTrackingSettings(settings) {
    const s = parseProjectSettings(settings);
    return s.partner_link_tracking && typeof s.partner_link_tracking === 'object'
        ? s.partner_link_tracking
        : {};
}

function getAgentNetworkSettings(settings) {
    const s = parseProjectSettings(settings);
    return s.agent_network && typeof s.agent_network === 'object' ? s.agent_network : {};
}

function getCommissionRulesSettings(settings) {
    const s = parseProjectSettings(settings);
    return s.commission_rules && typeof s.commission_rules === 'object' ? s.commission_rules : {};
}

module.exports = {
    parseProjectSettings,
    getPartnerAgentIdSettings,
    getPartnerLinkTrackingSettings,
    getAgentNetworkSettings,
    getCommissionRulesSettings,
};
