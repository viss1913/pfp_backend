const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    buildClientRegistrationVerificationPayload,
    parseEmailVerificationPayload,
} = require('../../src/services/agentNetworkService');

test('buildClientRegistrationVerificationPayload stores agent_id and ref', () => {
    const payload = buildClientRegistrationVerificationPayload(
        { ref: 'abc123', utm_source: 'pfp' },
        { id: 42, partner_agent_id: 'FINAM1' }
    );
    assert.equal(payload.agent_id, 42);
    assert.equal(payload.ref, 'abc123');
    assert.equal(payload.registration_attribution.ref, 'abc123');
    assert.equal(payload.registration_attribution.utm.utm_partner_finam, 'FINAM1');
});

test('buildClientRegistrationVerificationPayload without ref yields null agent_id', () => {
    const payload = buildClientRegistrationVerificationPayload({}, null);
    assert.equal(payload.agent_id, null);
    assert.equal(payload.ref, null);
});

test('parseEmailVerificationPayload handles json string and object', () => {
    assert.deepEqual(parseEmailVerificationPayload('{"agent_id":5}'), { agent_id: 5 });
    assert.deepEqual(parseEmailVerificationPayload({ agent_id: 7 }), { agent_id: 7 });
    assert.deepEqual(parseEmailVerificationPayload(null), {});
    assert.deepEqual(parseEmailVerificationPayload('not-json'), {});
});
