const { PDFDocument } = require('pdf-lib');

/**
 * Merge multiple PDF buffers into one.
 * @param {Buffer[]} buffers
 * @returns {Promise<Buffer>}
 */
async function mergePdfBuffers(buffers) {
    const list = Array.isArray(buffers) ? buffers.filter((b) => b && b.length) : [];
    if (list.length === 0) {
        return Buffer.alloc(0);
    }
    if (list.length === 1) {
        return list[0];
    }

    const out = await PDFDocument.create();
    for (const buf of list) {
        const src = await PDFDocument.load(buf);
        const srcPages = await out.copyPages(src, src.getPageIndices());
        srcPages.forEach((p) => out.addPage(p));
    }
    const bytes = await out.save({ useObjectStreams: true, addDefaultPage: false });
    return Buffer.from(bytes);
}

module.exports = {
    mergePdfBuffers,
};
