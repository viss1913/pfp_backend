const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    buildFamilyOfficeActivateUrl,
    getFamilyOfficeActivateBaseUrl,
    deriveActivateBaseFromRegisterUrl,
    normalizeActivateBaseUrl,
    getInviteTokenTtlDays,
} = require('../../src/utils/familyOfficeActivateUrl');

test('buildFamilyOfficeActivateUrl sets token query param with trailing slash path', () => {
    const url = buildFamilyOfficeActivateUrl({
        baseUrl: 'https://family-office.bank-future.com/invite/activate',
        token: 'abc123hex',
    });
    const u = new URL(url);
    assert.equal(u.searchParams.get('token'), 'abc123hex');
    assert.equal(u.hostname, 'family-office.bank-future.com');
    assert.equal(u.pathname, '/invite/activate/');
});

test('normalizeActivateBaseUrl fixes path without trailing slash', () => {
    assert.equal(
        normalizeActivateBaseUrl('https://family-office.bank-future.com/invite/activate'),
        'https://family-office.bank-future.com/invite/activate/'
    );
});

test('deriveActivateBaseFromRegisterUrl maps register path to activate', () => {
    assert.equal(
        deriveActivateBaseFromRegisterUrl('https://family-office.bank-future.com/register/'),
        'https://family-office.bank-future.com/invite/activate/'
    );
});

test('getFamilyOfficeActivateBaseUrl prefers register env when activate unset', () => {
    const prevActivate = process.env.AGENT_INVITE_ACTIVATE_BASE_URL;
    const prevRegister = process.env.AGENT_REGISTER_BASE_URL;
    delete process.env.AGENT_INVITE_ACTIVATE_BASE_URL;
    process.env.AGENT_REGISTER_BASE_URL = 'https://family-office.bank-future.com/register/';
    assert.equal(
        getFamilyOfficeActivateBaseUrl(),
        'https://family-office.bank-future.com/invite/activate/'
    );
    if (prevActivate !== undefined) process.env.AGENT_INVITE_ACTIVATE_BASE_URL = prevActivate;
    else delete process.env.AGENT_INVITE_ACTIVATE_BASE_URL;
    if (prevRegister !== undefined) process.env.AGENT_REGISTER_BASE_URL = prevRegister;
    else delete process.env.AGENT_REGISTER_BASE_URL;
});

test('getInviteTokenTtlDays defaults to 7', () => {
    const prev = process.env.AGENT_INVITE_TOKEN_TTL_DAYS;
    delete process.env.AGENT_INVITE_TOKEN_TTL_DAYS;
    assert.equal(getInviteTokenTtlDays(), 7);
    if (prev !== undefined) process.env.AGENT_INVITE_TOKEN_TTL_DAYS = prev;
});
