const fs = require('fs');
const path = require('path');

const FINAM_V2_DIR = __dirname;
const localFileDataUrlCache = new Map();
const optionalFileCache = new Map();
const templateRawCache = new Map();
const templateInlinedCache = new Map();
const OPTIMIZED_ASSET_ALIASES = Object.freeze({
    'assets/avatar-ai-finam-v2.png': 'assets/avatar-ai-finam-v2.svg',
    // 7MB PNG убивал HTML-preview (base64 + iframe srcdoc). WebP ~15KB.
    'assets/life-subscription-hero.png': 'assets/life-subscription-hero.webp',
    'assets/goal-inheritance.webp': 'assets/goal-inheritance-opt.webp',
});

/** Не инлайнить сырые файлы больше лимита — иначе отчёт не отдаётся по таймауту. */
const MAX_INLINE_ASSET_BYTES = Math.min(
    Math.max(Number(process.env.FINAM_V2_MAX_INLINE_ASSET_BYTES) || 512 * 1024, 64 * 1024),
    8 * 1024 * 1024
);

const PRODUCTION_PAGE_STYLE = `<style data-finam-v2-production="1">
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
.finam-v2-page {
  margin: 0 !important;
  flex-shrink: 0 !important;
  transform: scale(1.3333333333);
  transform-origin: top left;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
</style>`;

const PRODUCTION_DOCUMENT_STYLE = `<style data-finam-v2-production="1">
@page { size: 595px 842px; margin: 0; }
html, body {
  margin: 0 !important;
  padding: 0 !important;
  width: 595px !important;
  min-width: 595px !important;
  max-width: 595px !important;
  background: #fff !important;
}
body {
  display: block !important;
  overflow: visible !important;
}
.finam-v2-page {
  margin: 0 !important;
  flex-shrink: 0 !important;
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
    };
    return map[ext] || 'application/octet-stream';
}

function resolveOptimizedAssetPath(relativePath) {
    const cleaned = String(relativePath || '').split('?')[0].replace(/^\.?\//, '');
    const alias = OPTIMIZED_ASSET_ALIASES[cleaned];
    if (!alias) return cleaned;
    const aliasAbs = path.join(FINAM_V2_DIR, alias);
    if (fs.existsSync(aliasAbs) && fs.statSync(aliasAbs).isFile()) return alias;
    return cleaned;
}

function localFileDataUrl(relativePath) {
    const cleaned = String(relativePath || '').split('?')[0].replace(/^\.?\//, '');
    if (localFileDataUrlCache.has(cleaned)) return localFileDataUrlCache.get(cleaned);
    const resolvedPath = resolveOptimizedAssetPath(cleaned);
    let abs = path.join(FINAM_V2_DIR, resolvedPath);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
        localFileDataUrlCache.set(cleaned, null);
        return null;
    }
    let size = fs.statSync(abs).size;
    if (size > MAX_INLINE_ASSET_BYTES) {
        const webpCandidate = abs.replace(/\.(png|jpe?g)$/i, '.webp');
        if (webpCandidate !== abs && fs.existsSync(webpCandidate)) {
            abs = webpCandidate;
            size = fs.statSync(abs).size;
        } else {
            console.warn(
                `[finamV2TemplateLoader] skip inline asset (${size} bytes > ${MAX_INLINE_ASSET_BYTES}): ${cleaned}`
            );
            localFileDataUrlCache.set(cleaned, null);
            return null;
        }
    }
    const buf = fs.readFileSync(abs);
    const dataUrl = `data:${mimeTypeForLocalFile(abs)};base64,${buf.toString('base64')}`;
    localFileDataUrlCache.set(cleaned, dataUrl);
    return dataUrl;
}

function readOptionalFile(fileName) {
    if (optionalFileCache.has(fileName)) return optionalFileCache.get(fileName);
    const abs = path.join(FINAM_V2_DIR, fileName);
    if (!fs.existsSync(abs)) {
        optionalFileCache.set(fileName, '');
        return '';
    }
    const content = fs.readFileSync(abs, 'utf8');
    optionalFileCache.set(fileName, content);
    return content;
}

function inlineCssLinks(html) {
    return String(html || '').replace(
        /<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi,
        (tag, href) => {
            const cleanHref = String(href || '').split('?')[0];
            if (cleanHref === 'tokens.css' || cleanHref === 'page-wow-shared.css') {
                const css = readOptionalFile(cleanHref);
                return css ? `<style data-finam-v2-inline-css="${cleanHref}">\n${css}\n</style>` : '';
            }
            return tag;
        }
    );
}

function inlineLocalAssets(html) {
    return String(html || '')
        .replace(/url\((['"]?)(assets\/[^'")]+)\1\)/gi, (match, quote, assetPath) => {
            const dataUrl = localFileDataUrl(assetPath);
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

function extractTitle(html, fallback = 'Finam Report v2') {
    const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return match ? match[1].trim() : fallback;
}

function isFinamV2PageArticle(openingTag) {
    const classMatch = String(openingTag || '').match(/\bclass=(["'])(.*?)\1/i);
    if (!classMatch) return false;
    return classMatch[2].split(/\s+/).includes('finam-v2-page');
}

function extractFinamV2Articles(html) {
    const s = String(html || '');
    const tokenRegex = /<\/?article\b[^>]*>/gi;
    const articles = [];
    let depth = 0;
    let rootStart = -1;
    let rootIsPage = false;
    let match;

    while ((match = tokenRegex.exec(s))) {
        const token = match[0];
        const isClosing = /^<\//.test(token);
        if (!isClosing) {
            if (depth === 0) {
                rootStart = match.index;
                rootIsPage = isFinamV2PageArticle(token);
            }
            depth += 1;
        } else if (depth > 0) {
            depth -= 1;
            if (depth === 0 && rootIsPage && rootStart >= 0) {
                articles.push(s.slice(rootStart, tokenRegex.lastIndex));
                rootStart = -1;
                rootIsPage = false;
            }
        }
    }

    return articles;
}

function wrapArticleDocument({ headInner, articleHtml, title }) {
    return `<!DOCTYPE html>
<html lang="ru">
<head>
${headInner}
${PRODUCTION_PAGE_STYLE}
</head>
<body>
${articleHtml}
</body>
</html>`;
}

function injectProductionStyle(html, style = PRODUCTION_PAGE_STYLE) {
    const s = String(html || '');
    if (s.includes('data-finam-v2-production="1"')) return s;
    if (/<\/head>/i.test(s)) {
        return s.replace(/<\/head>/i, `${style}\n</head>`);
    }
    return s;
}

function isTemplateCacheEnabled() {
    return process.env.FINAM_V2_TEMPLATE_CACHE !== '0';
}

function getTemplateFileMtime(fileName) {
    return fs.statSync(path.join(FINAM_V2_DIR, fileName)).mtimeMs;
}

function readTemplateRaw(fileName) {
    const abs = path.join(FINAM_V2_DIR, fileName);
    const mtime = getTemplateFileMtime(fileName);
    if (isTemplateCacheEnabled()) {
        const cached = templateRawCache.get(fileName);
        if (cached && cached.mtime === mtime) return cached.content;
    }
    const raw = fs.readFileSync(abs, 'utf8');
    templateRawCache.set(fileName, { content: raw, mtime });
    return raw;
}

function readTemplateInlined(fileName) {
    const mtime = getTemplateFileMtime(fileName);
    if (isTemplateCacheEnabled()) {
        const cached = templateInlinedCache.get(fileName);
        if (cached && cached.mtime === mtime) return cached.content;
    }
    const inlined = inlineLocalAssets(inlineCssLinks(readTemplateRaw(fileName)));
    templateInlinedCache.set(fileName, { content: inlined, mtime });
    return inlined;
}

function loadTemplateDocument(fileName) {
    return injectProductionStyle(readTemplateInlined(fileName), PRODUCTION_DOCUMENT_STYLE);
}

function loadTemplatePhysicalPages(fileName) {
    const inlined = readTemplateInlined(fileName);
    const headInner = extractHeadInner(inlined);
    const title = extractTitle(inlined, fileName);
    const articles = extractFinamV2Articles(inlined);
    const pageArticles = articles.length ? articles : [String(inlined).match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || inlined];
    return pageArticles.map((articleHtml) => wrapArticleDocument({ headInner, articleHtml, title }));
}

/**
 * После `applyTemplateData` подробный план подменяет весь `<body>` на N `article.finam-v2-page`.
 * Если резать шаблон на листа **до** подстановки и вызывать apply на каждый кусок, каждый лист
 * получает полный календарь целиком → дубли в merged HTML / «хвост года» перед первой страницей.
 * Поэтому для таких шаблонов: один полный документ → apply → затем разбор на физические страницы.
 */
function splitFinamV2DocumentIntoPhysicalPages(html) {
    const s = String(html || '');
    const articles = extractFinamV2Articles(s);
    if (articles.length <= 1) {
        return [s];
    }
    const headInner = extractHeadInner(s);
    const title = extractTitle(s);
    return articles.map((articleHtml) => wrapArticleDocument({ headInner, articleHtml, title }));
}

module.exports = {
    loadTemplateDocument,
    loadTemplatePhysicalPages,
    splitFinamV2DocumentIntoPhysicalPages,
    extractFinamV2Articles,
    inlineLocalAssets,
    inlineCssLinks,
};
