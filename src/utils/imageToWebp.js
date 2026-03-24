const sharp = require('sharp');

/**
 * PNG (или другой растр, который понимает sharp) → WebP.
 * @param {Buffer} inputBuffer
 * @param {{ quality?: number, effort?: number }} [opts]
 * @returns {Promise<Buffer>}
 */
async function bufferToWebp(inputBuffer, opts = {}) {
    const quality = opts.quality ?? 90;
    const effort = opts.effort ?? 4;
    return sharp(inputBuffer).webp({ quality, effort }).toBuffer();
}

module.exports = { bufferToWebp };
