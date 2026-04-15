const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

function envFlagTrue(name) {
    const v = String(process.env[name] || '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
}

function gsExecutable() {
    const fromEnv = String(process.env.REPORT_PDF_GS_PATH || '').trim();
    if (fromEnv) return fromEnv;
    return process.platform === 'win32' ? 'gswin64c' : 'gs';
}

function gsTimeoutMs() {
    const n = parseInt(process.env.REPORT_PDF_GS_TIMEOUT_MS || '180000', 10);
    return Number.isFinite(n) && n >= 5000 ? n : 180000;
}

function pdfSettingsProfile() {
    const p = String(process.env.REPORT_PDF_GS_PDFSETTINGS || '/ebook').trim();
    if (!p.startsWith('/')) return '/ebook';
    return p;
}

/**
 * Включается явно: REPORT_PDF_GS_COMPRESS=1 (на проде + ghostscript в образе).
 */
function isPdfGsCompressionEnabled() {
    return envFlagTrue('REPORT_PDF_GS_COMPRESS');
}

/**
 * Ghostscript: перепаковка PDF (меньше вес при той же отрисовке страниц).
 * @param {Buffer} pdfBuffer
 * @returns {Promise<Buffer|null>} null если выключено, ошибка, или выход пустой
 */
async function compressPdfBufferWithGhostscript(pdfBuffer) {
    if (!isPdfGsCompressionEnabled()) return null;
    if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) return null;

    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'pfp-pdf-gs-'));
    const inPath = path.join(tmpDir, 'in.pdf');
    const outPath = path.join(tmpDir, 'out.pdf');

    try {
        await fsp.writeFile(inPath, pdfBuffer);
        const gs = gsExecutable();
        const args = [
            '-sDEVICE=pdfwrite',
            '-dCompatibilityLevel=1.4',
            `-dPDFSETTINGS=${pdfSettingsProfile()}`,
            '-dDetectDuplicateImages=true',
            '-dCompressFonts=true',
            '-dSubsetFonts=true',
            '-dNOPAUSE',
            '-dBATCH',
            '-dQUIET',
            `-sOutputFile=${outPath}`,
            inPath,
        ];

        await new Promise((resolve, reject) => {
            const child = spawn(gs, args, { stdio: ['ignore', 'pipe', 'pipe'] });
            let stderr = '';
            let settled = false;
            const t = setTimeout(() => {
                if (settled) return;
                settled = true;
                try {
                    child.kill('SIGKILL');
                } catch (_) {
                    /* ignore */
                }
                reject(new Error(`ghostscript timeout after ${gsTimeoutMs()}ms`));
            }, gsTimeoutMs());
            child.stderr?.on('data', (c) => {
                stderr += c.toString();
            });
            child.on('error', (err) => {
                if (settled) return;
                settled = true;
                clearTimeout(t);
                reject(err);
            });
            child.on('close', (code) => {
                if (settled) return;
                settled = true;
                clearTimeout(t);
                if (code === 0) resolve();
                else reject(new Error(`ghostscript exit ${code}: ${stderr.slice(0, 500)}`));
            });
        });

        const out = await fsp.readFile(outPath);
        return Buffer.isBuffer(out) && out.length > 0 ? out : null;
    } finally {
        await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
}

module.exports = {
    isPdfGsCompressionEnabled,
    compressPdfBufferWithGhostscript,
};
