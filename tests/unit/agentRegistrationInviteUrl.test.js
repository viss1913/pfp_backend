const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    buildAgentRegistrationInviteUrl,
    getAgentRegisterBaseUrl,
} = require('../../src/utils/agentRegistrationInviteUrl');

test('getAgentRegisterBaseUrl falls back to family office domain', () => {
    const prevBase = process.env.AGENT_REGISTER_BASE_URL;
    const prevAlias = process.env.FRONTEND_AGENT_REGISTER_URL;
    delete process.env.AGENT_REGISTER_BASE_URL;
    delete process.env.FRONTEND_AGENT_REGISTER_URL;

    assert.equal(getAgentRegisterBaseUrl(), 'https://family-office.bank-future.com/register/');

    if (prevBase !== undefined) process.env.AGENT_REGISTER_BASE_URL = prevBase;
    if (prevAlias !== undefined) process.env.FRONTEND_AGENT_REGISTER_URL = prevAlias;
});

test('buildAgentRegistrationInviteUrl adds project_key ref and utm', () => {
    const url = buildAgentRegistrationInviteUrl({
        baseUrl: 'https://pfp-front-ver3.vercel.app/register',
        projectPublicKey: 'pk_test',
        referralRef: 'abc123',
        inviterPartnerAgentId: 'FINAM99',
    });
    const u = new URL(url);
    assert.equal(u.origin + u.pathname, 'https://pfp-front-ver3.vercel.app/register');
    assert.equal(u.searchParams.get('project_key'), 'pk_test');
    assert.equal(u.searchParams.get('ref'), 'abc123');
    assert.equal(u.searchParams.get('utm_partner_finam'), 'FINAM99');
    assert.equal(u.searchParams.get('utm_source'), 'pfp');
    assert.equal(u.searchParams.get('utm_campaign'), 'subagent_register');
});

test('buildAgentRegistrationInviteUrl works without inviter finam id', () => {
    const url = buildAgentRegistrationInviteUrl({
        baseUrl: 'https://example.com/',
        projectPublicKey: 'pk_x',
        referralRef: 'r1',
        inviterPartnerAgentId: null,
    });
    const u = new URL(url);
    assert.equal(u.searchParams.get('ref'), 'r1');
    assert.equal(u.searchParams.get('utm_partner_finam'), null);
});
