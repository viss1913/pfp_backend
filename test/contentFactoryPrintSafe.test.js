const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    ensureContentHtmlPrintSafe,
    MARK,
} = require('../src/utils/contentFactoryPrintSafe');

test('ensureContentHtmlPrintSafe injects print-safe style once', () => {
    const html = `<!DOCTYPE html><html><head><style>.card{page-break-after:always}</style></head>
<body data-cf-orient="portrait"><div class="sheet">A</div></body></html>`;
    const out = ensureContentHtmlPrintSafe(html);
    assert.ok(out.includes(`${MARK}="1"`));
    assert.ok(out.includes('page-break-after: auto !important'));
    assert.ok(out.includes('.sheet'));
    const again = ensureContentHtmlPrintSafe(out);
    assert.equal((again.match(new RegExp(MARK, 'g')) || []).length, 1);
});

test('ensureContentHtmlPrintSafe respects landscape from body attr', () => {
    const html = `<html><head></head><body data-cf-orient="landscape"><div class="sheet">x</div></body></html>`;
    const out = ensureContentHtmlPrintSafe(html);
    assert.ok(out.includes('297mm 210mm'));
});
