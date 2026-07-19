/**
 * Static Content Factory HTML templates (Finam A4).
 */
const fs = require('node:fs');
const path = require('node:path');

const TEMPLATES_DIR = path.join(__dirname, '../../assets/content-factory/templates');
const MANIFEST_PATH = path.join(TEMPLATES_DIR, 'manifest.json');
const DEFAULT_TEMPLATE_ID = 'finam-a4-portrait-light';

const TEMPLATE_TITLES = {
    'finam-a4-portrait-light': 'A4 вертикальный — светлый',
    'finam-a4-portrait-dark': 'A4 вертикальный — тёмный',
    'finam-a4-landscape-light': 'A4 горизонтальный — светлый',
    'finam-a4-landscape-dark': 'A4 горизонтальный — тёмный',
};

let manifestCache = null;

function readManifest() {
    if (manifestCache) return manifestCache;
    const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
    manifestCache = JSON.parse(raw);
    return manifestCache;
}

function resetManifestCache() {
    manifestCache = null;
}

function normalizeTemplateId(id) {
    return String(id || '').trim();
}

function isKnownTemplateId(id) {
    const tid = normalizeTemplateId(id);
    if (!tid) return false;
    const manifest = readManifest();
    return (manifest.templates || []).some((t) => t.id === tid);
}

function resolveTemplateId(id) {
    const tid = normalizeTemplateId(id);
    if (tid && isKnownTemplateId(tid)) return tid;
    if (isKnownTemplateId(DEFAULT_TEMPLATE_ID)) return DEFAULT_TEMPLATE_ID;
    const manifest = readManifest();
    return manifest.templates?.[0]?.id || DEFAULT_TEMPLATE_ID;
}

function getTemplateMeta(id) {
    const tid = normalizeTemplateId(id);
    if (!tid || !isKnownTemplateId(tid)) {
        const err = new Error(`Unknown template: ${id || '(empty)'}`);
        err.statusCode = 404;
        err.code = 'unknown_template';
        throw err;
    }
    const manifest = readManifest();
    const row = (manifest.templates || []).find((t) => t.id === tid);
    return {
        ...row,
        title: TEMPLATE_TITLES[row.id] || row.id,
        brand: manifest.brand || 'finam',
    };
}

function loadTemplateHtml(id) {
    const meta = getTemplateMeta(resolveTemplateId(id));
    const filePath = path.join(TEMPLATES_DIR, meta.file);
    if (!fs.existsSync(filePath)) {
        const err = new Error(`Template file missing: ${meta.file}`);
        err.statusCode = 500;
        throw err;
    }
    return fs.readFileSync(filePath, 'utf8');
}

function listTemplatesForAdmin() {
    const manifest = readManifest();
    return (manifest.templates || []).map((row) => ({
        id: row.id,
        title: TEMPLATE_TITLES[row.id] || row.id,
        orientation: row.orientation,
        theme: row.theme,
        format: row.format,
        page_size: row.page_size,
        preview_url: `/api/admin/content-factory/templates/${row.id}/preview`,
    }));
}

function normalizePageCount(value) {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n) || n < 1) return 1;
    if (n > 20) return 20;
    return n;
}

function buildIdeConstraints(baseTemplateId, pageCount = 1) {
    const tid = resolveTemplateId(baseTemplateId);
    return {
        base_template_id: tid,
        page_count: normalizePageCount(pageCount),
        preserve_template_chrome: true,
        preserve_attributes: ['data-cta-slot'],
        language: 'ru',
    };
}

module.exports = {
    TEMPLATES_DIR,
    DEFAULT_TEMPLATE_ID,
    readManifest,
    resetManifestCache,
    isKnownTemplateId,
    resolveTemplateId,
    normalizePageCount,
    getTemplateMeta,
    loadTemplateHtml,
    listTemplatesForAdmin,
    buildIdeConstraints,
};
