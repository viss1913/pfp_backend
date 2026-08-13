const test = require('node:test');
const assert = require('node:assert/strict');
const {
    resolveReportThemeKey,
    isRostechReportV2Project,
    ROSTECH_IMMERS_PROJECT_ID,
} = require('../src/reports/themes/themeResolver');

test('Immers Rostech project 6 → rostech theme + v2', () => {
    assert.equal(resolveReportThemeKey(6), 'rostech');
    assert.equal(isRostechReportV2Project(6), true);
});

test('legacy Railway project 22 → rostech, not v2', () => {
    assert.equal(resolveReportThemeKey(22), 'rostech');
    assert.equal(isRostechReportV2Project(22), false);
});

test('Yadro is not Rostech', () => {
    assert.equal(
        resolveReportThemeKey(9, { slug: 'yadro', name: 'Yadro', public_key: 'pk_2a19a53a1c58b4756817f35b' }),
        'yadro'
    );
    assert.equal(isRostechReportV2Project(9), false);
});

test('Finam default project stays default', () => {
    assert.equal(resolveReportThemeKey(14, { slug: 'finam', name: 'Finam' }), 'default');
});

test('Immers project id constant is 6', () => {
    assert.equal(ROSTECH_IMMERS_PROJECT_ID, 6);
});
