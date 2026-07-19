const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertValidPdfBuffer } = require('../src/services/contentFactoryService');

test('assertValidPdfBuffer accepts valid PDF header', () => {
    const buf = Buffer.from('%PDF-1.4\n%fake');
    const out = assertValidPdfBuffer(buf);
    assert.equal(out, buf);
});

test('assertValidPdfBuffer rejects empty buffer', () => {
    assert.throws(
        () => assertValidPdfBuffer(Buffer.alloc(0)),
        (err) => err.code === 'PDF_EMPTY' && err.statusCode === 500,
    );
});

test('assertValidPdfBuffer rejects non-PDF payload', () => {
    assert.throws(
        () => assertValidPdfBuffer(Buffer.from('{"error":"nope"}')),
        (err) => err.code === 'PDF_INVALID' && err.statusCode === 500,
    );
});
