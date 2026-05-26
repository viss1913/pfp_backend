const assert = require('node:assert/strict');
const test = require('node:test');

const {
    DEFAULT_COMON_SHOWCASE_PROJECT_IDS,
    getComonShowcaseConfigFromProject,
    isComonShowcaseProject,
} = require('../src/utils/projectComonShowcaseSettings');
const { buildStrategiesListRequest } = require('../src/services/comonService');
const { isFinamTemplateProject } = require('../src/reports/finam/finamTemplateProjects');
const {
    RECOMMENDED_STRATEGIES_PATH,
    RECOMMENDED_TAG,
} = require('../scripts/sync_comon_recommended_strategies');

test('Comon showcase is allowed only for Finam test/prod projects by default', () => {
    assert.deepEqual(DEFAULT_COMON_SHOWCASE_PROJECT_IDS, [2, 14]);
    assert.equal(
        isComonShowcaseProject({ id: 2, public_key: 'pk_7f1ccfe5b2598134a575320d' }),
        true
    );
    assert.equal(
        isComonShowcaseProject({ id: 14, public_key: 'pk_fedf4e6cb9ad07f8e7ce2c81' }),
        true
    );
    assert.equal(
        isComonShowcaseProject({ id: 29, public_key: 'pk_8ef9004b1d87aab34c8476e5' }),
        false
    );

    const project2Config = getComonShowcaseConfigFromProject({
        id: 2,
        public_key: 'pk_7f1ccfe5b2598134a575320d',
        settings: null,
    });
    assert.equal(project2Config?.enabled, true);
    assert.deepEqual(project2Config?.gate_product_types, ['STOCK']);

    const sberConfig = getComonShowcaseConfigFromProject({
        id: 29,
        public_key: 'pk_8ef9004b1d87aab34c8476e5',
        settings: null,
    });
    assert.equal(sberConfig, null);
});

test('Finam template projects include project 2', () => {
    assert.equal(isFinamTemplateProject(2), true);
    assert.equal(isFinamTemplateProject(3), true);
    assert.equal(isFinamTemplateProject(14), true);
    assert.equal(isFinamTemplateProject(29), true);
    assert.equal(isFinamTemplateProject(999), false);
});

test('Comon sync request is deterministic for recommended endpoint', () => {
    assert.equal(RECOMMENDED_STRATEGIES_PATH, '/api/v2/strategies');
    assert.equal(RECOMMENDED_TAG, 'recommended');

    const req = buildStrategiesListRequest({
        page: 2,
        pageSize: 50,
        path: RECOMMENDED_STRATEGIES_PATH,
        tags: RECOMMENDED_TAG,
    });

    assert.equal(req.listPath, '/api/v2/strategies');
    assert.deepEqual(req.params, {
        page: 2,
        pageSize: 50,
        tags: 'recommended',
    });
});
