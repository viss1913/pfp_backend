const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildFamilyOfficeActivateUrl, getInviteTokenTtlDays } = require('../../src/utils/familyOfficeActivateUrl');

test('buildFamilyOfficeActivateUrl sets token query param', () => {
    const url = buildFamilyOfficeActivateUrl({
        baseUrl: 'https://pfp-front-ver3.vercel.app/invite/activate',
        token: 'abc123hex',
    });
    const u = new URL(url);
    assert.equal(u.searchParams.get('token'), 'abc123hex');
});

test('getInviteTokenTtlDays defaults to 7', () => {
    const prev = process.env.AGENT_INVITE_TOKEN_TTL_DAYS;
    delete process.env.AGENT_INVITE_TOKEN_TTL_DAYS;
    assert.equal(getInviteTokenTtlDays(), 7);
    if (prev !== undefined) process.env.AGENT_INVITE_TOKEN_TTL_DAYS = prev;
});
