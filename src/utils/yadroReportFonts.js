/**
 * Полный DejaVu (не PdfSubset) — subset ~37KB режет кириллицу → «иероглифы» в PDF.
 * Только для темы yadro.
 */
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
let cachedInjection = null;

function buildYadroFontInjectionHtml() {
    if (cachedInjection !== null) return cachedInjection;

    const normalPath = path.join(REPO_ROOT, 'assets', 'fonts', 'DejaVuSans.ttf');
    const boldPath = path.join(REPO_ROOT, 'assets', 'fonts', 'DejaVuSans-Bold.ttf');
    const robotoPath = path.join(REPO_ROOT, 'assets', 'fonts', 'Roboto-Regular.ttf');

    if (fs.existsSync(normalPath)) {
        const normalB64 = fs.readFileSync(normalPath).toString('base64');
        const boldB64 = fs.existsSync(boldPath)
            ? fs.readFileSync(boldPath).toString('base64')
            : normalB64;
        cachedInjection = `<style data-yadro-pdf-font="1">
@font-face{font-family:YadroPdfSans;src:url(data:font/ttf;base64,${normalB64}) format('truetype');font-weight:400;font-style:normal;font-display:block;}
@font-face{font-family:YadroPdfSans;src:url(data:font/ttf;base64,${boldB64}) format('truetype');font-weight:600;font-style:normal;font-display:block;}
@font-face{font-family:YadroPdfSans;src:url(data:font/ttf;base64,${boldB64}) format('truetype');font-weight:700;font-style:normal;font-display:block;}
html,body,.page,.content,table,td,th,div,span,p,h1,h2,h3,li,button{font-family:YadroPdfSans,'DejaVu Sans',sans-serif!important;}
svg text{font-family:YadroPdfSans,'DejaVu Sans',sans-serif!important;}
</style>`;
        return cachedInjection;
    }

    if (fs.existsSync(robotoPath)) {
        const b64 = fs.readFileSync(robotoPath).toString('base64');
        cachedInjection = `<style data-yadro-pdf-font="1">
@font-face{font-family:YadroPdfSans;src:url(data:font/ttf;base64,${b64}) format('truetype');font-weight:400;font-style:normal;font-display:block;}
html,body,.page,.content,table,td,th,div,span,p,h1,h2,h3,li,button{font-family:YadroPdfSans,Roboto,sans-serif!important;}
svg text{font-family:YadroPdfSans,Roboto,sans-serif!important;}
</style>`;
        return cachedInjection;
    }

    console.warn('[yadroReportFonts] no DejaVu/Roboto — кириллица в PDF может сломаться');
    cachedInjection = '';
    return cachedInjection;
}

function injectYadroReportFonts(html) {
    const s = String(html || '');
    if (!s || s.includes('data-yadro-pdf-font')) return s;
    const inj = buildYadroFontInjectionHtml();
    if (!inj) return s;
    if (/<\/head>/i.test(s)) {
        return s.replace(/<\/head>/i, `${inj}\n</head>`);
    }
    if (/<head[^>]*>/i.test(s)) {
        return s.replace(/<head[^>]*>/i, (open) => `${open}\n${inj}\n`);
    }
    return `${inj}\n${s}`;
}

module.exports = {
    buildYadroFontInjectionHtml,
    injectYadroReportFonts,
};
