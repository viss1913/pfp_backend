const test = require('node:test');
const assert = require('node:assert/strict');
const { _test } = require('../../src/services/ideAgentSsoService');

test('buildAgentProfilePatch normalizes website_url', () => {
    const patch = _test.buildAgentProfilePatch({
        first_name: ' Виктор ',
        last_name: 'Петров',
        middle_name: 'Иванович',
        phone: '+79001234567',
        region: 'RU-MOW',
        website_url: 'sites.athenis.ru/finansovyy-konsultant/',
    });

    assert.equal(patch.first_name, 'Виктор');
    assert.equal(patch.region, 'RU-MOW');
    assert.match(patch.website_url, /^https:\/\/sites\.athenis\.ru\//);
});

test('buildAgentProfilePatch clears website_url on null', () => {
    const patch = _test.buildAgentProfilePatch({
        first_name: 'A',
        website_url: null,
    });
    assert.equal(patch.website_url, null);
});

test('normalizePhone trims and returns null for empty', () => {
    assert.equal(_test.normalizePhone('  +7900 '), '+7900');
    assert.equal(_test.normalizePhone(''), null);
    assert.equal(_test.normalizePhone(null), null);
});

test('SSO ticket TTL is 60 seconds', () => {
    assert.equal(_test.SSO_TICKET_TTL_SECONDS, 60);
});
