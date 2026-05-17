const { getPartnerAgentIdSettings } = require('./projectSettings');
const { buildTrackedPartnerUrl } = require('./trackedPartnerUrl');

const DEFAULT_FINAM_AGENT_LANDING = 'https://broker.finam.ru/landing/agent/';
const FINAM_AGENT_LINK_TYPE = 'agent_register';

function getFinamAgentLandingBaseUrl(projectSettings) {
    const cfg = getPartnerAgentIdSettings(projectSettings);
    const fromSettings =
        cfg.finam_agent_landing_url != null && String(cfg.finam_agent_landing_url).trim() !== ''
            ? String(cfg.finam_agent_landing_url).trim()
            : null;
    const fromEnv =
        process.env.FINAM_AGENT_LANDING_URL != null &&
        String(process.env.FINAM_AGENT_LANDING_URL).trim() !== ''
            ? String(process.env.FINAM_AGENT_LANDING_URL).trim()
            : null;
    return fromSettings || fromEnv || DEFAULT_FINAM_AGENT_LANDING;
}

/**
 * URL for the agent to complete Finam broker registration (parent attribution when invited).
 * @param {{ projectSettings?: object, referrerAgent?: { partner_agent_id?: string|null }|null }} opts
 * @returns {string}
 */
function buildFinamAgentRegistrationUrl(opts = {}) {
    const base = getFinamAgentLandingBaseUrl(opts.projectSettings);
    const referrer = opts.referrerAgent;
    const partnerId =
        referrer?.partner_agent_id != null && String(referrer.partner_agent_id).trim() !== ''
            ? String(referrer.partner_agent_id).trim()
            : null;
    if (!partnerId) return base;

    return buildTrackedPartnerUrl(base, {
        linkType: FINAM_AGENT_LINK_TYPE,
        agent: referrer,
        projectSettings: opts.projectSettings,
    });
}

/**
 * Agent's own referral URL on Finam landing (requires partner_agent_id).
 * @param {{ projectSettings?: object, agent?: { partner_agent_id?: string|null }|null }} opts
 * @returns {string|null}
 */
function buildFinamAgentReferralUrl(opts = {}) {
    const agent = opts.agent;
    const partnerId =
        agent?.partner_agent_id != null && String(agent.partner_agent_id).trim() !== ''
            ? String(agent.partner_agent_id).trim()
            : null;
    if (!partnerId) return null;

    const base = getFinamAgentLandingBaseUrl(opts.projectSettings);
    return buildTrackedPartnerUrl(base, {
        linkType: FINAM_AGENT_LINK_TYPE,
        agent,
        projectSettings: opts.projectSettings,
    });
}

/**
 * @param {{ projectSettings?: object, agent: object, parentAgent?: object|null }} opts
 */
function buildAgentFinamUrls(opts = {}) {
    const { projectSettings, agent, parentAgent } = opts;
    const referrer =
        parentAgent && agent?.parent_agent_id != null ? parentAgent : null;

    return {
        finam_agent_registration_url: buildFinamAgentRegistrationUrl({
            projectSettings,
            referrerAgent: referrer,
        }),
        finam_agent_referral_url: buildFinamAgentReferralUrl({
            projectSettings,
            agent,
        }),
    };
}

module.exports = {
    DEFAULT_FINAM_AGENT_LANDING,
    FINAM_AGENT_LINK_TYPE,
    getFinamAgentLandingBaseUrl,
    buildFinamAgentRegistrationUrl,
    buildFinamAgentReferralUrl,
    buildAgentFinamUrls,
};
