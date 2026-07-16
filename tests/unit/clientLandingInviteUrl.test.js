const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    buildClientLandingInviteUrl,
    getClientLandingBaseUrl,
    getClientInviteLandingPath,
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
