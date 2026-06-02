const test = require('node:test');
const assert = require('node:assert/strict');
const { isReportPdfAiEnabled } = require('../../src/utils/reportPdfAiEnv');

test('isReportPdfAiEnabled: enabled by default when env unset', () => {
    const prev = process.env.PFP_PDF_FINAM_AI;
    delete process.env.PFP_PDF_FINAM_AI;
    try {
        assert.equal(isReportPdfAiEnabled(), true);
    } finally {
        if (prev === undefined) delete process.env.PFP_PDF_FINAM_AI;
        else process.env.PFP_PDF_FINAM_AI = prev;
    }
});

test('isReportPdfAiEnabled: disabled for 0/false/off', () => {
    const prev = process.env.PFP_PDF_FINAM_AI;
    try {
        for (const v of ['0', 'false', 'off', 'no', 'disabled']) {
            process.env.PFP_PDF_FINAM_AI = v;
            assert.equal(isReportPdfAiEnabled(), false, `expected off for ${v}`);
        }
    } finally {
        if (prev === undefined) delete process.env.PFP_PDF_FINAM_AI;
        else process.env.PFP_PDF_FINAM_AI = prev;
    }
});
