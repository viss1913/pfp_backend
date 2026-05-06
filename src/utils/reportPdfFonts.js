const fs = require('fs');
const path = require('path');

const REPO_ROOT_FOR_PDF_FONTS = path.join(__dirname, '..', '..');

/** Кэш HTML-блока с @font-face (DejaVu — есть U+20BD ₽) для страниц в iframe[srcdoc]. */
let cachedReportPdfFontInjectionHtml = null;

function buildReportPdfFontInjectionHtml() {
    if (cachedReportPdfFontInjectionHtml !== null) {
        return cachedReportPdfFontInjectionHtml;
    }
    const subsetNormal = path.join(REPO_ROOT_FOR_PDF_FONTS, 'assets', 'fonts', 'DejaVuSans-PdfSubset.woff2');
    const subsetBold = path.join(REPO_ROOT_FOR_PDF_FONTS, 'assets', 'fonts', 'DejaVuSans-Bold-PdfSubset.woff2');
    if (fs.existsSync(subsetNormal)) {
        const normalB64 = fs.readFileSync(subsetNormal).toString('base64');
        const boldB64 = fs.existsSync(subsetBold) ? fs.readFileSync(subsetBold).toString('base64') : normalB64;
        cachedReportPdfFontInjectionHtml = `<style data-pfp-pdf-font="1">
@font-face{font-family:PfpPdfSans;src:url(data:font/woff2;base64,${normalB64}) format('woff2');font-weight:400;font-style:normal;font-display:block;}
@font-face{font-family:PfpPdfSans;src:url(data:font/woff2;base64,${boldB64}) format('woff2');font-weight:700;font-style:normal;font-display:block;}
body{font-family:PfpPdfSans,'DejaVu Sans',sans-serif!important;}
svg text{font-family:PfpPdfSans,'DejaVu Sans',sans-serif!important;}
</style>`;
        return cachedReportPdfFontInjectionHtml;
    }

    const normalPath = path.join(REPO_ROOT_FOR_PDF_FONTS, 'assets', 'fonts', 'DejaVuSans.ttf');
    const boldPath = path.join(REPO_ROOT_FOR_PDF_FONTS, 'assets', 'fonts', 'DejaVuSans-Bold.ttf');
    if (!fs.existsSync(normalPath)) {
        console.warn('[reportPdfFonts] DejaVuSans.ttf not found — символ ₽ в PDF может отображаться квадратиком');
        cachedReportPdfFontInjectionHtml = '';
        return cachedReportPdfFontInjectionHtml;
    }
    const normalB64 = fs.readFileSync(normalPath).toString('base64');
    const boldB64 = fs.existsSync(boldPath) ? fs.readFileSync(boldPath).toString('base64') : normalB64;
    cachedReportPdfFontInjectionHtml = `<style data-pfp-pdf-font="1">
@font-face{font-family:PfpPdfSans;src:url(data:font/ttf;base64,${normalB64}) format('truetype');font-weight:400;font-style:normal;font-display:block;}
@font-face{font-family:PfpPdfSans;src:url(data:font/ttf;base64,${boldB64}) format('truetype');font-weight:700;font-style:normal;font-display:block;}
body{font-family:PfpPdfSans,'DejaVu Sans',sans-serif!important;}
svg text{font-family:PfpPdfSans,'DejaVu Sans',sans-serif!important;}
</style>`;
    return cachedReportPdfFontInjectionHtml;
}

/**
 * Встраиваем DejaVu в HTML (для iframe[srcdoc] или одиночного документа NDA).
 */
function injectReportPdfEmbeddedFont(html) {
    const s = String(html || '');
    if (!s || s.includes('data-pfp-pdf-font')) return s;
    const inj = buildReportPdfFontInjectionHtml();
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
    buildReportPdfFontInjectionHtml,
    injectReportPdfEmbeddedFont,
};
