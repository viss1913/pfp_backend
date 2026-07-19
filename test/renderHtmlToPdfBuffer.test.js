const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    renderHtmlToPdfBuffer,
    closeSharedPuppeteerBrowser,
} = require('../src/utils/renderHtmlToPdfBuffer');

test('renderHtmlToPdfBuffer returns Buffer safe for base64 roundtrip', async () => {
    const pdf = await renderHtmlToPdfBuffer('<!doctype html><html><body><p>ok</p></body></html>');
    try {
        assert.equal(Buffer.isBuffer(pdf), true);
        assert.equal(pdf.subarray(0, 4).toString('ascii'), '%PDF');
        const roundtrip = Buffer.from(pdf.toString('base64'), 'base64');
        assert.equal(roundtrip.subarray(0, 4).toString('ascii'), '%PDF');
        assert.equal(roundtrip.length, pdf.length);
    } finally {
        await closeSharedPuppeteerBrowser();
    }
});
