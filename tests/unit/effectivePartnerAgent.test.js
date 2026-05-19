const test = require('node:test');
const assert = require('node:assert/strict');
const {
    resolveEffectivePartnerAgentId,
    resolvePartnerAgentIdMode,
    hasPartnerFullAccess,
    agentForPartnerTracking,
} = require('../../src/utils/effectivePartnerAgent');

const parent = { partner_agent_id: 'PARENT1' };

test('resolveEffectivePartnerAgentId prefers own', () => {
    assert.equal(
        resolveEffectivePartnerAgentId(
            { partner_agent_id: 'OWN', inherit_parent_partner_agent_id: true },
            parent
        ),
        'OWN'
    );
});

test('resolveEffectivePartnerAgentId inherits parent when flagged', () => {
    assert.equal(
        resolveEffectivePartnerAgentId(
            { partner_agent_id: null, inherit_parent_partner_agent_id: true },
            parent
        ),
        'PARENT1'
    );
});

test('hasPartnerFullAccess true on skip with parent id', () => {
    assert.equal(
        hasPartnerFullAccess(
            { partner_agent_id: null, inherit_parent_partner_agent_id: true },
            parent,
            true
        ),
        true
    );
});

test('hasPartnerFullAccess false without own or inherit', () => {
    assert.equal(
        hasPartnerFullAccess({ partner_agent_id: null, inherit_parent_partner_agent_id: false }, parent, true),
        false
    );
});

test('agentForPartnerTracking sets effective id on copy', () => {
    const agent = { id: 1, partner_agent_id: null, inherit_parent_partner_agent_id: true };
    const tracked = agentForPartnerTracking(agent, parent);
    assert.equal(tracked.partner_agent_id, 'PARENT1');
    assert.equal(resolvePartnerAgentIdMode(agent, parent), 'parent_inherited');
});

test('resolveEffectivePartnerAgentId uses platform default for FO self-register', () => {
    const prev = process.env.PFP_MAIN_FINAM_AGENT_ID;
    process.env.PFP_MAIN_FINAM_AGENT_ID = 'PLATFORM1';
    const agent = {
        partner_agent_id: null,
        inherit_parent_partner_agent_id: false,
        registration_attribution: JSON.stringify({
            utm_medium: 'family_office_self_register',
        }),
    };
    assert.equal(resolveEffectivePartnerAgentId(agent, null), 'PLATFORM1');
    assert.equal(resolvePartnerAgentIdMode(agent, null), 'platform_default');
    assert.equal(hasPartnerFullAccess(agent, null, true), true);
    if (prev === undefined) delete process.env.PFP_MAIN_FINAM_AGENT_ID;
    else process.env.PFP_MAIN_FINAM_AGENT_ID = prev;
});

test('resolveEffectivePartnerAgentId prefers own over platform default', () => {
    const prev = process.env.PFP_MAIN_FINAM_AGENT_ID;
    process.env.PFP_MAIN_FINAM_AGENT_ID = 'PLATFORM1';
    const agent = {
        partner_agent_id: 'OWN99',
        registration_attribution: JSON.stringify({
            utm_medium: 'family_office_self_register',
        }),
    };
    assert.equal(resolveEffectivePartnerAgentId(agent, null), 'OWN99');
    assert.equal(resolvePartnerAgentIdMode(agent, null), 'own');
    if (prev === undefined) delete process.env.PFP_MAIN_FINAM_AGENT_ID;
    else process.env.PFP_MAIN_FINAM_AGENT_ID = prev;
});

test('FO self-register without env platform id returns null effective', () => {
    const prev = process.env.PFP_MAIN_FINAM_AGENT_ID;
    delete process.env.PFP_MAIN_FINAM_AGENT_ID;
    const agent = {
        partner_agent_id: null,
        registration_attribution: JSON.stringify({
            utm_medium: 'family_office_self_register',
        }),
    };
    assert.equal(resolveEffectivePartnerAgentId(agent, null), null);
    if (prev !== undefined) process.env.PFP_MAIN_FINAM_AGENT_ID = prev;
});
