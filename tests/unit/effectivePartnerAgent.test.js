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
