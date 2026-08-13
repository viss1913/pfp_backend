const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertValidPdfBuffer, mergePdfBuffers } = require('../src/services/contentFactoryService');

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

test('mergePdfBuffers returns single buffer as-is', async () => {
    const one = Buffer.from('%PDF-1.4\n%fake');
    const out = await mergePdfBuffers([one]);
    assert.equal(out, one);
});

test('mergePdfBuffers concatenates real PDFs from pdf-lib', async () => {
    const { PDFDocument } = require('pdf-lib');
    async function tinyPdf(label) {
        const doc = await PDFDocument.create();
        const page = doc.addPage([200, 200]);
        page.drawText(label, { x: 20, y: 100, size: 12 });
        return Buffer.from(await doc.save());
    }
    const a = await tinyPdf('A');
    const b = await tinyPdf('B');
    const merged = await mergePdfBuffers([a, b]);
    assert.equal(merged.subarray(0, 4).toString('ascii'), '%PDF');
    const loaded = await PDFDocument.load(merged);
    assert.equal(loaded.getPageCount(), 2);
});
