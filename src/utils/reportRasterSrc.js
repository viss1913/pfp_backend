const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { publicUrlFromKey } = require('./r2Client');
const { bufferToWebp } = require('./imageToWebp');

const WEBP_QUALITY = Number(process.env.REPORT_RASTER_WEBP_QUALITY) || 85;
const WEBP_EFFORT = Number(process.env.REPORT_RASTER_WEBP_EFFORT) || 4;

function cacheDirForRepo(repoRoot) {
    return path.join(repoRoot, 'tmp', '.report-raster-cache');
}

function mimeTypeForRaster(absPath) {
    const ext = path.extname(absPath).toLowerCase();
    if (ext === '.webp') return 'image/webp';
    if (ext === '.png') return 'image/png';
    if (ext === '.gif') return 'image/gif';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    return 'application/octet-stream';
}

function localRasterToDataUrl(absPath) {
    const buf = fs.readFileSync(absPath);
    const mime = mimeTypeForRaster(absPath);
    return `data:${mime};base64,${buf.toString('base64')}`;
}

/**
 * JPEG/WebP без изменений; PNG и GIF → WebP (рядом .webp или кэш в tmp/.report-raster-cache).
 * @param {string} absPath
 * @param {string} repoRoot
 * @returns {Promise<string>} абсолютный путь к файлу для вставки в PDF/HTML
 */
async function ensureLocalRasterWebpOrJpeg(absPath, repoRoot) {
    if (!absPath || !fs.existsSync(absPath)) return absPath;
    const ext = path.extname(absPath).toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg' || ext === '.webp') return absPath;
    if (ext !== '.png' && ext !== '.gif') return absPath;

    const baseNoExt = absPath.slice(0, -ext.length);
    const siblingWebp = `${baseNoExt}.webp`;
    if (fs.existsSync(siblingWebp)) {
        try {
            const stSrc = fs.statSync(absPath);
            const stWebp = fs.statSync(siblingWebp);
            if (stWebp.mtimeMs >= stSrc.mtimeMs) return path.resolve(siblingWebp);
        } catch {
            /* кэш ниже */
        }
    }

    const dir = cacheDirForRepo(repoRoot);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const st = fs.statSync(absPath);
    const tag = crypto
        .createHash('sha256')
        .update(path.resolve(absPath))
        .update(String(st.mtimeMs))
        .update(String(st.size))
        .digest('hex');
    const cachedPath = path.join(dir, `${tag}.webp`);
    if (fs.existsSync(cachedPath)) return cachedPath;

    const buf = fs.readFileSync(absPath);
    const webp = await bufferToWebp(buf, { quality: WEBP_QUALITY, effort: WEBP_EFFORT });
    fs.writeFileSync(cachedPath, webp);
    return cachedPath;
}

/**
 * Локальный путь или URL: http(s) без изменений; локальный растр прогоняется через ensureLocalRasterWebpOrJpeg.
 * @param {string|null|undefined} ref
 * @param {string} rootDir
 * @param {string} repoRoot — корень репозитория (кэш WebP)
 * @param {boolean} [inlineLocalAssets]
 * @param {string} [stockR2Prefix]
 * @returns {Promise<string>}
 */
async function resolveReportRasterRef(
    ref,
    rootDir,
    repoRoot,
    inlineLocalAssets = false,
    stockR2Prefix = 'pdf-report-summary-stock-assets'
) {
    if (ref == null || !String(ref).trim()) return '';
    const s = String(ref).trim();
    if (/^data:/i.test(s)) return s;
    if (/^https?:\/\//i.test(s)) return s;

    const abs = path.isAbsolute(s) ? path.normalize(s) : path.resolve(rootDir, s);

    if (fs.existsSync(abs)) {
        const optimized = await ensureLocalRasterWebpOrJpeg(abs, repoRoot);
        if (inlineLocalAssets) {
            try {
                return localRasterToDataUrl(optimized);
            } catch {
                return pathToFileURL(optimized).href;
            }
        }
        return pathToFileURL(optimized).href;
    }

    const basename = path.basename(abs);
    const r2Key = `${stockR2Prefix}/${basename}`;
    const pub = publicUrlFromKey(r2Key);
    if (pub) return pub;

    return '';
}

module.exports = {
    ensureLocalRasterWebpOrJpeg,
    localRasterToDataUrl,
    resolveReportRasterRef,
    mimeTypeForRaster,
};
