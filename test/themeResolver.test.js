const assert = require('node:assert/strict');
const test = require('node:test');

const {
    DEFAULT_THEME_KEY,
    ROSTECH_THEME_KEY,
    resolveReportThemeKey,
    isRostechStyleReportProject,
} = require('../src/reports/themes/themeResolver');

test('resolveReportThemeKey: Rostech and NPF Renaissance use rostech PDF theme', () => {
    assert.equal(resolveReportThemeKey(22), ROSTECH_THEME_KEY);
    assert.equal(resolveReportThemeKey(4), ROSTECH_THEME_KEY);
    assert.equal(resolveReportThemeKey('4'), ROSTECH_THEME_KEY);
    assert.equal(resolveReportThemeKey(14), DEFAULT_THEME_KEY);
    assert.equal(resolveReportThemeKey(null), DEFAULT_THEME_KEY);
});

test('isRostechStyleReportProject', () => {
    assert.equal(isRostechStyleReportProject(22), true);
    assert.equal(isRostechStyleReportProject(4), true);
    assert.equal(isRostechStyleReportProject(29), false);
});
