/**
 * Effective Finam / partner ID: own partner_agent_id or parent when inherit flag is set.
 * Never copy parent ID into agents.partner_agent_id (unique per project).
 */

function normalizePartnerId(raw) {
    if (raw == null) return null;
    const s = String(raw).trim();
    return s || null;
}

function isInheritParentPartnerId(agent) {
    return agent?.inherit_parent_partner_agent_id === true;
}

/**
 * @param {object|null|undefined} agent
 * @param {object|null|undefined} parentAgent
 * @returns {string|null}
 */
function resolveEffectivePartnerAgentId(agent, parentAgent = null) {
    const own = normalizePartnerId(agent?.partner_agent_id);
    if (own) return own;
    if (isInheritParentPartnerId(agent)) {
        return normalizePartnerId(parentAgent?.partner_agent_id);
    }
    return null;
}

/**
 * @returns {'own'|'parent_inherited'|null}
 */
function resolvePartnerAgentIdMode(agent, parentAgent = null) {
    if (normalizePartnerId(agent?.partner_agent_id)) return 'own';
    if (isInheritParentPartnerId(agent) && normalizePartnerId(parentAgent?.partner_agent_id)) {
        return 'parent_inherited';
    }
    return null;
}

/**
 * @param {boolean} partnerIdRequired from project settings
 */
function hasPartnerFullAccess(agent, parentAgent, partnerIdRequired) {
    if (partnerIdRequired !== true) return true;
    if (normalizePartnerId(agent?.partner_agent_id)) return true;
    if (
        isInheritParentPartnerId(agent) &&
        normalizePartnerId(parentAgent?.partner_agent_id)
    ) {
        return true;
    }
    return false;
}

/**
 * Agent shape for buildTrackedPartnerUrl / HTML tracking.
 * @param {object} agent
 * @param {object|null} parentAgent
 */
function agentForPartnerTracking(agent, parentAgent = null) {
    const effectiveId = resolveEffectivePartnerAgentId(agent, parentAgent);
    return {
        ...agent,
        partner_agent_id: effectiveId,
    };
}

module.exports = {
    normalizePartnerId,
    isInheritParentPartnerId,
    resolveEffectivePartnerAgentId,
    resolvePartnerAgentIdMode,
    hasPartnerFullAccess,
    agentForPartnerTracking,
};
