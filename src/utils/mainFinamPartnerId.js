const FAMILY_OFFICE_SELF_REGISTER_UTM_MEDIUM = 'family_office_self_register';

function getMainFinamPartnerIdFromEnv() {
    const raw = process.env.PFP_MAIN_FINAM_AGENT_ID;
    if (raw == null || String(raw).trim() === '') return null;
    return String(raw).trim();
}

function parseRegistrationAttribution(agent) {
    if (!agent?.registration_attribution) return null;
    try {
        return typeof agent.registration_attribution === 'string'
            ? JSON.parse(agent.registration_attribution)
            : agent.registration_attribution;
    } catch (_) {
        return null;
    }
}

function isFamilyOfficeSelfRegisterAgent(agent) {
    const attr = parseRegistrationAttribution(agent);
    return attr?.utm_medium === FAMILY_OFFICE_SELF_REGISTER_UTM_MEDIUM;
}

/**
 * @returns {number[]|null} null = no whitelist (all projects allowed)
 */
function getFamilyOfficeSelfRegisterProjectIdsFromEnv() {
    const raw = process.env.FAMILY_OFFICE_SELF_REGISTER_PROJECT_IDS;
    if (raw == null || String(raw).trim() === '') return null;
    const ids = String(raw)
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n) && n > 0);
    return ids.length > 0 ? ids : null;
}

function assertFamilyOfficeProjectAllowed(projectId) {
    const allowed = getFamilyOfficeSelfRegisterProjectIdsFromEnv();
    if (allowed == null) return;
    const pid = Number(projectId);
    if (!allowed.includes(pid)) {
        throw {
            status: 400,
            message: 'Регистрация Family Office недоступна для выбранного проекта',
        };
    }
}

module.exports = {
    FAMILY_OFFICE_SELF_REGISTER_UTM_MEDIUM,
    getMainFinamPartnerIdFromEnv,
    parseRegistrationAttribution,
    isFamilyOfficeSelfRegisterAgent,
    getFamilyOfficeSelfRegisterProjectIdsFromEnv,
    assertFamilyOfficeProjectAllowed,
};
