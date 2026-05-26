const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    DEFAULT_PROJECT_CATALOG_ONLY_PROJECT_IDS,
    isProjectCatalogOnly,
    shouldIncludeSystemCatalog,
} = require('../../src/utils/projectTenantCatalogScope');

test('project 3 is catalog-only by default', () => {
    assert.deepEqual(DEFAULT_PROJECT_CATALOG_ONLY_PROJECT_IDS, [3]);
    assert.equal(isProjectCatalogOnly(3), true);
    assert.equal(isProjectCatalogOnly(14), false);
});

test('system catalog fallback is disabled only for configured projects', () => {
    assert.equal(shouldIncludeSystemCatalog(3, true), false);
    assert.equal(shouldIncludeSystemCatalog(3, false), false);
    assert.equal(shouldIncludeSystemCatalog(14, true), true);
    assert.equal(shouldIncludeSystemCatalog(14, false), false);
});
