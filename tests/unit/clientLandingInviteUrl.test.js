const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    buildClientLandingInviteUrl,
    getClientLandingBaseUrl,
} = require('../../src/utils/clientLandingInviteUrl');

test('getClientLandingBaseUrl falls back to family office root', () => {
    const prevBase = process.env.CLIENT_LANDING_BASE_URL;
    const prevAlias = process.env.FRONTEND_CLIENT_LANDING_URL;
    delete process.env.CLIENT_LANDING_BASE_URL;
    delete process.env.FRONTEND_CLIENT_LANDING_URL;

    assert.equal(getClientLandingBaseUrl(), 'https://family-office.bank-future.com/');

    if (prevBase !== undefined) process.env.CLIENT_LANDING_BASE_URL = prevBase;
    if (prevAlias !== undefined) process.env.FRONTEND_CLIENT_LANDING_URL = prevAlias;
});

test('buildClientLandingInviteUrl adds project_key ref and utm', () => {
    const url = buildClientLandingInviteUrl({
        baseUrl: 'https://family-office.bank-future.com/',
        projectPublicKey: 'pk_test',
        referralRef: 'abc123',
        inviterPartnerAgentId: 'FINAM99',
    });
    const u = new URL(url);
    assert.equal(u.origin + u.pathname, 'https://family-office.bank-future.com/');
    assert.equal(u.searchParams.get('project_key'), 'pk_test');
    assert.equal(u.searchParams.get('ref'), 'abc123');
    assert.equal(u.searchParams.get('utm_partner_finam'), 'FINAM99');
    assert.equal(u.searchParams.get('utm_source'), 'pfp');
    assert.equal(u.searchParams.get('utm_medium'), 'agent_client_invite');
    assert.equal(u.searchParams.get('utm_campaign'), 'b2c_register');
});

test('buildClientLandingInviteUrl works without inviter finam id', () => {
    const url = buildClientLandingInviteUrl({
        baseUrl: 'https://example.com/',
        projectPublicKey: 'pk_x',
        referralRef: 'r1',
        inviterPartnerAgentId: null,
    });
    const u = new URL(url);
    assert.equal(u.searchParams.get('ref'), 'r1');
    assert.equal(u.searchParams.get('utm_partner_finam'), null);
});
