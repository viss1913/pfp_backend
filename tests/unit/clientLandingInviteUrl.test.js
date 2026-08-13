const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    buildClientLandingInviteUrl,
    buildAgentClientInviteUrl,
    getClientLandingBaseUrl,
    getClientInviteLandingPath,
    normalizeAgentWebsiteUrl,
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

test('buildClientLandingInviteUrl — only ref on /plan', () => {
    const url = buildClientLandingInviteUrl({
        baseUrl: 'https://family-office.bank-future.com/',
        referralRef: 'abc123',
        landingPath: '/plan',
    });
    const u = new URL(url);
    assert.equal(u.origin + u.pathname, 'https://family-office.bank-future.com/plan');
    assert.equal(u.searchParams.get('ref'), 'abc123');
    assert.equal(u.searchParams.get('project_key'), null);
    assert.equal(u.searchParams.get('utm_source'), null);
    assert.equal(u.searchParams.get('utm_partner_finam'), null);
    assert.equal(u.search, '?ref=abc123');
});

test('buildClientLandingInviteUrl without ref — clean landing path only', () => {
    const url = buildClientLandingInviteUrl({
        baseUrl: 'https://example.com/',
        referralRef: '',
        landingPath: '/plan',
    });
    const u = new URL(url);
    assert.equal(u.origin + u.pathname, 'https://example.com/plan');
    assert.equal(u.search, '');
});

test('getClientInviteLandingPath defaults to /plan', () => {
    const prev = process.env.CLIENT_INVITE_LANDING_PATH;
    delete process.env.CLIENT_INVITE_LANDING_PATH;
    assert.equal(getClientInviteLandingPath(), '/plan');
    if (prev !== undefined) process.env.CLIENT_INVITE_LANDING_PATH = prev;
});

test('normalizeAgentWebsiteUrl accepts https and host without scheme', () => {
    assert.equal(normalizeAgentWebsiteUrl('https://agent.example.com/page?x=1#h'), 'https://agent.example.com/page');
    assert.equal(normalizeAgentWebsiteUrl('agent.example.com'), 'https://agent.example.com/');
    assert.equal(normalizeAgentWebsiteUrl('  '), null);
    assert.equal(normalizeAgentWebsiteUrl('javascript:alert(1)'), null);
    assert.equal(normalizeAgentWebsiteUrl('ftp://evil.example.com'), null);
    assert.equal(normalizeAgentWebsiteUrl(null), null);
});

test('buildClientLandingInviteUrl preservePath keeps agent site pathname', () => {
    const url = buildClientLandingInviteUrl({
        baseUrl: 'https://agent.example.com/home',
        referralRef: 'slug99',
        preservePath: true,
    });
    const u = new URL(url);
    assert.equal(u.origin + u.pathname, 'https://agent.example.com/home');
    assert.equal(u.search, '?ref=slug99');
});

test('buildAgentClientInviteUrl uses website_url when set', () => {
    const built = buildAgentClientInviteUrl({
        referralRef: 'ref1',
        websiteUrl: 'https://my-site.ru/welcome',
    });
    assert.equal(built.uses_agent_website, true);
    assert.equal(built.website_url, 'https://my-site.ru/welcome');
    const u = new URL(built.url);
    assert.equal(u.origin + u.pathname, 'https://my-site.ru/welcome');
    assert.equal(u.searchParams.get('ref'), 'ref1');
});

test('buildAgentClientInviteUrl falls back to default /plan when website empty', () => {
    const prevBase = process.env.CLIENT_LANDING_BASE_URL;
    process.env.CLIENT_LANDING_BASE_URL = 'https://family-office.bank-future.com/';

    const built = buildAgentClientInviteUrl({
        referralRef: 'ref2',
        websiteUrl: '',
    });
    assert.equal(built.uses_agent_website, false);
    assert.equal(built.website_url, null);
    const u = new URL(built.url);
    assert.equal(u.pathname, '/plan');
    assert.equal(u.searchParams.get('ref'), 'ref2');

    if (prevBase !== undefined) process.env.CLIENT_LANDING_BASE_URL = prevBase;
    else delete process.env.CLIENT_LANDING_BASE_URL;
});
