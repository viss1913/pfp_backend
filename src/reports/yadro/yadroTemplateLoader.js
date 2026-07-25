const fs = require('fs');
const path = require('path');

const TEMPLATE_DIR = path.join(__dirname, 'html');
const ASSETS_DIR = path.join(TEMPLATE_DIR, 'assets');

const MIME_BY_EXT = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
};

let cachedShellCss = null;

function getShellCss() {
    if (cachedShellCss != null) return cachedShellCss;
    const cssPath = path.join(TEMPLATE_DIR, 'shell.css');
    cachedShellCss = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';
    return cachedShellCss;
}

function mimeFor(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return MIME_BY_EXT[ext] || 'application/octet-stream';
}

function assetToDataUrl(absPath) {
    if (!fs.existsSync(absPath)) return null;
    const buf = fs.readFileSync(absPath);
    const mime = mimeFor(absPath);
    if (mime === 'image/svg+xml') {
        // data URL for SVG: base64 is safer for Cyrillic filenames / content
        return `data:${mime};base64,${buf.toString('base64')}`;
    }
    return `data:${mime};base64,${buf.toString('base64')}`;
}

function escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtmlText(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Подставляет {{key}} → values[key]. Неизвестные ключи → «—».
 * HTML-комментарии не трогаем (там документация плейсхолдеров).
 * @param {string} html
 * @param {Record<string, string|number|null|undefined>} values
 */
function fillPlaceholders(html, values = {}) {
    const replaceInChunk = (chunk) =>
        String(chunk).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
            if (Object.prototype.hasOwnProperty.call(values, key)) {
                const v = values[key];
                if (v == null || v === '') return '—';
                return escapeHtmlText(v);
            }
            return '—';
        });

    const src = String(html);
    const out = [];
    const re = /<!--[\s\S]*?-->/g;
    let last = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
        out.push(replaceInChunk(src.slice(last, m.index)));
        out.push(m[0]);
        last = m.index + m[0].length;
    }
    out.push(replaceInChunk(src.slice(last)));
    return out.join('');
}

/**
 * Инлайнит shell.css (link → style) и локальные assets/* → data URL.
 * @param {string} html
 */
function prepareTemplateHtml(html) {
    let out = String(html);

    // <link rel="stylesheet" href="shell.css"> → inline
    const shell = getShellCss();
    out = out.replace(
        /<link\s+rel=["']stylesheet["']\s+href=["']shell\.css["']\s*\/?>/gi,
        shell ? `<style data-yadro-shell="1">\n${shell}\n</style>` : ''
    );

    // src="assets/..." and url('assets/...')
    out = out.replace(/(?:src|href)=["']assets\/([^"']+)["']/gi, (full, rel) => {
        const abs = path.join(ASSETS_DIR, rel);
        const data = assetToDataUrl(abs);
        if (!data) {
            console.warn('[yadroTemplateLoader] missing asset:', rel);
            return full;
        }
        const attr = full.startsWith('href') ? 'href' : 'src';
        return `${attr}="${data.replace(/"/g, '&quot;')}"`;
    });

    out = out.replace(/url\(\s*['"]?assets\/([^'")]+)['"]?\s*\)/gi, (full, rel) => {
        const abs = path.join(ASSETS_DIR, rel);
        const data = assetToDataUrl(abs);
        if (!data) return full;
        return `url("${data}")`;
    });

    return out;
}

/**
 * Читает HTML-шаблон, инлайнит CSS/ассеты, подставляет плейсхолдеры.
 * @param {string} fileName e.g. 'pension-01-intro.html'
 * @param {Record<string, string|number|null|undefined>} values
 */
function renderYadroTemplate(fileName, values = {}) {
    const abs = path.join(TEMPLATE_DIR, fileName);
    if (!fs.existsSync(abs)) {
        throw new Error(`[yadro] template not found: ${fileName}`);
    }
    const raw = fs.readFileSync(abs, 'utf8');
    const prepared = prepareTemplateHtml(raw);
    let html = fillPlaceholders(prepared, values);
    // Маркер для отладки: не Ростех, а Yadro
    if (/<html\b/i.test(html) && !/data-report-theme=/i.test(html)) {
        html = html.replace(/<html\b([^>]*)>/i, '<html$1 data-report-theme="yadro">');
    }
    return html;
}

function listYadroTemplates() {
    if (!fs.existsSync(TEMPLATE_DIR)) return [];
    return fs
        .readdirSync(TEMPLATE_DIR)
        .filter((f) => f.endsWith('.html'))
        .sort();
}

module.exports = {
    TEMPLATE_DIR,
    ASSETS_DIR,
    renderYadroTemplate,
    fillPlaceholders,
    prepareTemplateHtml,
    listYadroTemplates,
    escapeRe,
};
