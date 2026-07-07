const fs = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.join(__dirname, 'templates');
const localFileDataUrlCache = new Map();
const templateRawCache = new Map();
const templateInlinedCache = new Map();

const PRODUCTION_PAGE_STYLE = `<style data-rostech-v2-production="1">
@page { size: A4; margin: 0; }
html, body {
  margin: 0 !important;
  padding: 0 !important;
  width: 794px !important;
  min-width: 794px !important;
  max-width: 794px !important;
  height: 1123px !important;
  min-height: 1123px !important;
  max-height: 1123px !important;
  background: #fff !important;
}
body {
  display: block !important;
  overflow: hidden !important;
}
.page {
  margin: 0 !important;
  flex-shrink: 0 !important;
  transform: scale(1.3333333333);
  transform-origin: top left;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
</style>`;

function mimeTypeForLocalFile(absPath) {
    const ext = path.extname(absPath).toLowerCase();
    const map = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
    };
    return map[ext] || 'application/octet-stream';
}

function localFileDataUrl(relativePath) {
    const cleaned = String(relativePath || '').split('?')[0].replace(/^\.?\//, '');
    if (localFileDataUrlCache.has(cleaned)) return localFileDataUrlCache.get(cleaned);
    const abs = path.join(TEMPLATES_DIR, cleaned);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
        localFileDataUrlCache.set(cleaned, null);
        return null;
    }
    const buf = fs.readFileSync(abs);
    const dataUrl = `data:${mimeTypeForLocalFile(abs)};base64,${buf.toString('base64')}`;
    localFileDataUrlCache.set(cleaned, dataUrl);
    return dataUrl;
}

function inlineCssLinks(html) {
    return String(html || '').replace(
        /<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi,
        (tag, href) => {
            const cleanHref = String(href || '').split('?')[0].replace(/^\.?\//, '');
            const cssPath = cleanHref.startsWith('css/') ? cleanHref : `css/${cleanHref}`;
            const abs = path.join(TEMPLATES_DIR, cssPath);
            if (!fs.existsSync(abs)) return tag;
            const css = fs.readFileSync(abs, 'utf8');
            return `<style data-rostech-v2-inline-css="${cleanHref}">\n${css}\n</style>`;
        }
    );
}

function inlineLocalAssets(html) {
    return String(html || '')
        .replace(/url\((['"]?)([^'")]+)\1\)/gi, (match, quote, assetPath) => {
            const clean = String(assetPath || '').split('?')[0].replace(/^\.?\//, '');
            let resolved = clean;
            if (clean.startsWith('../fonts/')) {
                resolved = clean.replace(/^\.\.\/fonts\//, 'fonts/');
            } else if (clean.startsWith('fonts/')) {
                resolved = clean;
            } else if (clean.startsWith('assets/')) {
                resolved = clean;
            } else if (!clean.includes('/')) {
                resolved = `assets/${clean}`;
            }
            const dataUrl = localFileDataUrl(resolved);
            return dataUrl ? `url('${dataUrl}')` : match;
        })
        .replace(/\bsrc=(["'])(assets\/[^"']+)\1/gi, (match, quote, assetPath) => {
            const dataUrl = localFileDataUrl(assetPath);
            return dataUrl ? `src=${quote}${dataUrl}${quote}` : match;
        });
}

function extractHeadInner(html) {
    const match = String(html || '').match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    return match ? match[1] : '';
}

function extractTitle(html, fallback = 'Ростех НПФ') {
    const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return match ? match[1].trim() : fallback;
}

function extractRostechPages(html) {
    const s = String(html || '');
    const pages = [];
    const pageRe = /<section\b[^>]*class=(["'])[^"']*\bpage\b[^"']*\1[^>]*>[\s\S]*?<\/section>/gi;
    let match;
    while ((match = pageRe.exec(s))) {
        pages.push(match[0]);
    }
    if (pages.length) return pages;
    const bodyMatch = s.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return bodyMatch ? [bodyMatch[1].trim()] : [s];
}

function wrapPageDocument({ headInner, pageHtml, title }) {
    return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>${title}</title>
${headInner}
${PRODUCTION_PAGE_STYLE}
</head>
<body>
${pageHtml}
</body>
</html>`;
}

function readTemplateRaw(fileName) {
    if (templateRawCache.has(fileName)) return templateRawCache.get(fileName);
    const raw = fs.readFileSync(path.join(TEMPLATES_DIR, fileName), 'utf8');
    templateRawCache.set(fileName, raw);
    return raw;
}

function readTemplateInlined(fileName) {
    if (templateInlinedCache.has(fileName)) return templateInlinedCache.get(fileName);
    const inlined = inlineLocalAssets(inlineCssLinks(readTemplateRaw(fileName)));
    templateInlinedCache.set(fileName, inlined);
    return inlined;
}

function loadTemplatePages(fileName) {
    const inlined = readTemplateInlined(fileName);
    const headInner = extractHeadInner(inlined);
    const title = extractTitle(inlined, fileName);
    const pages = extractRostechPages(inlined);
    return pages.map((pageHtml) => wrapPageDocument({ headInner, pageHtml, title }));
}

function applyPlaceholders(html, data = {}) {
    let out = String(html || '');
    for (const [key, value] of Object.entries(data)) {
        const token = `{{${key}}}`;
        out = out.split(token).join(value == null ? '' : String(value));
    }
    return out;
}

function setBarHeight(html, barIndex, heightPx) {
    const bars = String(html || '').match(/class="compare-card__bar"[^>]*style="[^"]*"/g) || [];
    if (!bars[barIndex]) {
        const chartBars = String(html || '').match(/class="bar-chart__bar"[^>]*style="[^"]*"/g) || [];
        if (!chartBars[barIndex]) return html;
        const target = chartBars[barIndex];
        const updated = target.replace(/height:\s*[\d.]+%/, `height:${heightPx}%`);
        return String(html).replace(target, updated);
    }
    const target = bars[barIndex];
    const updated = target.replace(/height:\s*\d+px/, `height:${heightPx}px`);
    return String(html).replace(target, updated);
}

module.exports = {
    loadTemplatePages,
    readTemplateInlined,
    applyPlaceholders,
    setBarHeight,
    PRODUCTION_PAGE_STYLE,
};
