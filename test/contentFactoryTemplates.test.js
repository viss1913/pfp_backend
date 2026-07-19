const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const tpl = require('../src/utils/contentFactoryTemplates');

describe('contentFactoryTemplates', () => {
    it('lists 4 finam templates with preview_url', () => {
        const rows = tpl.listTemplatesForAdmin();
        assert.equal(rows.length, 4);
        for (const row of rows) {
            assert.ok(row.id.startsWith('finam-a4-'));
            assert.ok(row.preview_url.includes(row.id));
            assert.ok(row.title);
            assert.ok(['portrait', 'landscape'].includes(row.orientation));
            assert.ok(['light', 'dark'].includes(row.theme));
        }
    });

    it('loads template html with cta slot and footer', () => {
        const html = tpl.loadTemplateHtml('finam-a4-portrait-light');
        assert.ok(html.includes('data-cta-slot'));
        assert.ok(html.includes('ООО «Финам»'));
        assert.ok(html.includes('323323232'));
    });

    it('resolveTemplateId falls back to default', () => {
        assert.equal(tpl.resolveTemplateId(''), tpl.DEFAULT_TEMPLATE_ID);
        assert.equal(tpl.resolveTemplateId('nope'), tpl.DEFAULT_TEMPLATE_ID);
        assert.equal(tpl.resolveTemplateId('finam-a4-landscape-dark'), 'finam-a4-landscape-dark');
    });

    it('buildIdeConstraints includes base_template_id and page_count', () => {
        const c = tpl.buildIdeConstraints('finam-a4-portrait-dark', 3);
        assert.equal(c.base_template_id, 'finam-a4-portrait-dark');
        assert.equal(c.page_count, 3);
        assert.equal(c.preserve_template_chrome, true);
        assert.deepEqual(c.preserve_attributes, ['data-cta-slot']);
    });

    it('normalizePageCount clamps 1-20', () => {
        assert.equal(tpl.normalizePageCount(undefined), 1);
        assert.equal(tpl.normalizePageCount(0), 1);
        assert.equal(tpl.normalizePageCount(25), 20);
        assert.equal(tpl.normalizePageCount('2'), 2);
    });

    it('unknown template throws 404', () => {
        assert.throws(
            () => tpl.getTemplateMeta('totally-unknown-id-xyz'),
            (err) => err && err.statusCode === 404 && err.code === 'unknown_template',
        );
    });
});
