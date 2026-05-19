const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    enrichRegistrationAttributionBody,
    buildRegistrationAttribution,
} = require('../../src/services/agentNetworkService');

test('buildRegistrationAttribution includes utm_partner_finam from body', () => {
    const attr = buildRegistrationAttribution({
        ref: 'abc123',
        utm_source: 'pfp',
        utm_partner_finam: 'CM123',
    });
    assert.ok(attr);
    assert.equal(attr.ref, 'abc123');
    assert.equal(attr.utm.utm_source, 'pfp');
    assert.equal(attr.utm.utm_partner_finam, 'CM123');
});

test('enrichRegistrationAttributionBody sets utm_partner_finam from parent', () => {
    const enriched = enrichRegistrationAttributionBody(
        { ref: 'slug1', utm_source: 'pfp' },
        { partner_agent_id: 'PARENT1' }
    );
    assert.equal(enriched.utm_partner_finam, 'PARENT1');
    const attr = buildRegistrationAttribution(enriched);
    assert.equal(attr.utm.utm_partner_finam, 'PARENT1');
});

test('enrichRegistrationAttributionBody parent wins over spoofed body value', () => {
    const enriched = enrichRegistrationAttributionBody(
        { ref: 'slug1', utm_partner_finam: 'FAKE99' },
        { partner_agent_id: 'PARENT1' }
    );
    assert.equal(enriched.utm_partner_finam, 'PARENT1');
    const attr = buildRegistrationAttribution(enriched);
    assert.equal(attr.utm.utm_partner_finam, 'PARENT1');
});

test('enrichRegistrationAttributionBody no-op when parent has no finam id', () => {
    const body = { ref: 'slug1', utm_source: 'email' };
    const enriched = enrichRegistrationAttributionBody(body, { partner_agent_id: null });
    assert.equal(enriched.utm_partner_finam, undefined);
    const attr = buildRegistrationAttribution(enriched);
    assert.equal(attr.utm.utm_partner_finam, undefined);
    assert.equal(attr.utm.utm_source, 'email');
});

test('enrichRegistrationAttributionBody no-op without parent', () => {
    const body = { utm_partner_finam: 'SELF_ONLY' };
    const enriched = enrichRegistrationAttributionBody(body, null);
    assert.equal(enriched.utm_partner_finam, 'SELF_ONLY');
});
