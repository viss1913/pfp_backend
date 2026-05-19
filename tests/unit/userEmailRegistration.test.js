const test = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizeRegistrationEmail,
    buildReleasedUserEmail,
} = require('../../src/utils/userEmailRegistration');

test('normalizeRegistrationEmail lowercases and trims', () => {
    assert.equal(normalizeRegistrationEmail('  Alex@Mail.COM '), 'alex@mail.com');
});

test('buildReleasedUserEmail format', () => {
    assert.match(buildReleasedUserEmail(42), /^deleted\.user42\.\d+@pfp-deleted\.invalid$/);
});
