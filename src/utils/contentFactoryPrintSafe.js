/**
 * Print/PDF safety for Content Factory HTML (Finam A4 offers).
 * Mirrors IDE apps/api printSafe: kill sparse per-card page-breaks.
 */

const MARK = 'data-cf-print-safe';

/**
 * @param {string} html
 * @param {{ orientation?: string, format?: string }} [opts]
 * @returns {string}
 */
function pageSizeCss(opts = {}) {
    const format = String(opts.format || 'a4').toLowerCase();
    const orient = String(opts.orientation || 'portrait').toLowerCase();
    if (format === 'flyer') return { size: '148mm 210mm', w: '148mm', h: '210mm' };
    if (format === 'slide') return { size: '297mm 167mm', w: '297mm', h: '167mm' };
    if (orient === 'landscape') return { size: '297mm 210mm', w: '297mm', h: '210mm' };
    return { size: '210mm 297mm', w: '210mm', h: '297mm' };
}

/**
 * @param {string} html
 * @returns {{ orientation: string, format: string }}
 */
function detectOptsFromHtml(html) {
    const body = (html && html.match(/<body\b[^>]*>/i)?.[0]) || '';
    const orient =
        body.match(/\bdata-cf-orient=["']([^"']+)["']/i)?.[1] ||
        (/\blandscape\b/i.test(body) ? 'landscape' : 'portrait');
    const format = body.match(/\bdata-cf-format=["']([^"']+)["']/i)?.[1] || 'a4';
    return { orientation: orient, format };
}

/**
 * @param {{ orientation?: string, format?: string }} [opts]
 */
function buildPrintSafeCss(opts = {}) {
    const { size, w, h } = pageSizeCss(opts);
    return `
/* Content Factory print-safe (PFP) */
@page { size: ${size}; margin: 0; }
html, body {
  margin: 0 !important;
  padding: 0 !important;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
body *:not(.sheet):not(.page) {
  page-break-after: auto !important;
  break-after: auto !important;
  page-break-before: auto !important;
  break-before: auto !important;
  page-break-inside: auto !important;
  break-inside: auto !important;
}
.sheet,
article.sheet,
article.page,
.page {
  box-sizing: border-box !important;
  width: ${w} !important;
  max-width: ${w} !important;
  min-height: ${h} !important;
  height: ${h} !important;
  max-height: ${h} !important;
  overflow: hidden !important;
  margin: 0 auto !important;
  page-break-after: always !important;
  break-after: page !important;
  page-break-inside: avoid !important;
  break-inside: avoid !important;
}
.sheet:last-of-type,
article.sheet:last-of-type,
article.page:last-of-type,
.page:last-of-type {
  page-break-after: auto !important;
  break-after: auto !important;
}
.content,
main.content,
.sheet > main,
.page > main {
  min-height: 0 !important;
  flex: 1 1 auto !important;
  overflow: hidden !important;
}
[style*="100vh"],
[style*="100dvh"] {
  min-height: 0 !important;
  height: auto !important;
}
@media print {
  body { background: #fff !important; }
  .sheet,
  article.sheet,
  article.page,
  .page {
    box-shadow: none !important;
    margin: 0 !important;
  }
}
`.trim();
}

/**
 * Inject print-safe CSS. Idempotent.
 * @param {string} html
 * @param {{ orientation?: string, format?: string }|null} [opts]
 * @returns {string}
 */
function ensureContentHtmlPrintSafe(html, opts) {
    if (!html || !String(html).trim()) return html;
    const resolved = { ...detectOptsFromHtml(html), ...(opts || {}) };
    const css = buildPrintSafeCss(resolved);
    const block = `<style ${MARK}="1">\n${css}\n</style>`;

    if (new RegExp(`<style[^>]*\\b${MARK}\\b`, 'i').test(html)) {
        return html.replace(
            new RegExp(`<style[^>]*\\b${MARK}\\b[^>]*>[\\s\\S]*?<\\/style>`, 'i'),
            block
        );
    }
    if (/<\/head>/i.test(html)) {
        return html.replace(/<\/head>/i, `${block}\n</head>`);
    }
    if (/<\/style>/i.test(html)) {
        return html.replace(/<\/style>/i, (m) => `${m}\n${block}`);
    }
    return `${block}\n${html}`;
}

/**
 * Render Content Factory HTML → PDF buffer (A4, dense pages).
 * @param {string} html
 * @param {{ title?: string, orientation?: string, format?: string }} [options]
 * @returns {Promise<Buffer>}
 */
async function renderContentHtmlToPdfBuffer(html, options = {}) {
    const { renderHtmlToPdfBuffer } = require('./renderHtmlToPdfBuffer');
    let out = ensureContentHtmlPrintSafe(html, {
        orientation: options.orientation,
        format: options.format,
    });
    if (options.title && /<title>[^<]*<\/title>/i.test(out)) {
        out = out.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(options.title)}</title>`);
    } else if (options.title && /<\/head>/i.test(out)) {
        out = out.replace(/<\/head>/i, `<title>${escapeHtml(options.title)}</title></head>`);
    }
    return renderHtmlToPdfBuffer(out, {
        preferCssPageSize: true,
        pdfScale: 1,
    });
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

module.exports = {
    ensureContentHtmlPrintSafe,
    renderContentHtmlToPdfBuffer,
    MARK,
};
