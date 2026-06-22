const crypto = require('crypto');
const path = require('path');

const MAX_MEDIA_PER_COMMAND = 5;

const IMAGE_MIMES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
]);

const VIDEO_MIMES = new Set([
    'video/mp4',
    'video/webm',
    'video/quicktime',
]);

const DOCUMENT_MIMES = new Set(['application/pdf']);

/**
 * @param {unknown} raw
 * @returns {Array<{ id: string, type: 'image'|'video'|'document', url: string, key?: string, filename?: string, mime?: string, caption?: string, sort: number }>}
 */
function parseCommandMedia(raw) {
    if (raw == null || raw === '') return [];
    let data = raw;
    if (typeof raw === 'string') {
        try {
            data = JSON.parse(raw);
        } catch {
            return [];
        }
    }
    if (!Array.isArray(data)) return [];
    return data
        .map((item, index) => normalizeMediaItem(item, index))
        .filter(Boolean)
        .sort((a, b) => a.sort - b.sort);
}

function normalizeMediaItem(item, fallbackSort = 0) {
    if (!item || typeof item !== 'object') return null;
    const url = typeof item.url === 'string' ? item.url.trim() : '';
    if (!url) return null;
    let type = 'image';
    if (item.type === 'video') type = 'video';
    else if (item.type === 'document') type = 'document';
    else if (item.mime === 'application/pdf' || String(item.filename || '').toLowerCase().endsWith('.pdf')) {
        type = 'document';
    }
    return {
        id: typeof item.id === 'string' && item.id ? item.id : crypto.randomUUID(),
        type,
        url,
        key: typeof item.key === 'string' ? item.key : undefined,
        filename: typeof item.filename === 'string' ? item.filename : undefined,
        mime: typeof item.mime === 'string' ? item.mime : undefined,
        caption: typeof item.caption === 'string' ? item.caption : '',
        sort: Number.isFinite(Number(item.sort)) ? Number(item.sort) : fallbackSort,
    };
}

/**
 * @param {unknown} input
 * @returns {Array<object>|null}
 */
function normalizeCommandMediaForDb(input) {
    if (input === undefined) return undefined;
    if (input === null) return null;
    const parsed = parseCommandMedia(input);
    if (parsed.length > MAX_MEDIA_PER_COMMAND) {
        throw new Error(`Не больше ${MAX_MEDIA_PER_COMMAND} файлов на команду`);
    }
    return parsed;
}

function inferMediaType(mime, filename = '') {
    const m = String(mime || '').toLowerCase();
    const ext = path.extname(filename).toLowerCase();
    if (DOCUMENT_MIMES.has(m) || ext === '.pdf') return 'document';
    if (VIDEO_MIMES.has(m) || ['.mp4', '.webm', '.mov'].includes(ext)) return 'video';
    if (IMAGE_MIMES.has(m) || ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) return 'image';
    return null;
}

function commandKeyToSlug(commandKey = '') {
    return String(commandKey)
        .trim()
        .replace(/^\//, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .slice(0, 80) || 'command';
}

/** Имя файла для отображения в Telegram (не путать с S3 key). */
function resolveTelegramDocumentFilename(item, fallback = 'document.pdf') {
    const raw = String(item?.filename || '').trim();
    if (raw) {
        return raw.toLowerCase().endsWith('.pdf') ? raw : `${raw}.pdf`;
    }
    try {
        const base = decodeURIComponent(new URL(item.url).pathname.split('/').pop() || '');
        if (base && base.includes('.')) return base;
    } catch {
        // noop
    }
    return fallback;
}

/** Безопасный slug для ключа в R2 — Telegram берёт имя из URL, если нет Content-Disposition. */
function mediaFilenameToKeySlug(filename, fallback = 'document') {
    const raw = String(filename || '').trim().replace(/\.[a-z0-9]+$/i, '');
    const base = raw || fallback;
    return (
        base
            .replace(/[^\w.\- \u0400-\u04FF]+/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_')
            .slice(0, 60) || fallback
    );
}

function enrichCommandRow(row) {
    if (!row || typeof row !== 'object') return row;
    return {
        ...row,
        media: parseCommandMedia(row.media),
    };
}

module.exports = {
    MAX_MEDIA_PER_COMMAND,
    IMAGE_MIMES,
    VIDEO_MIMES,
    DOCUMENT_MIMES,
    parseCommandMedia,
    normalizeCommandMediaForDb,
    inferMediaType,
    commandKeyToSlug,
    resolveTelegramDocumentFilename,
    mediaFilenameToKeySlug,
    enrichCommandRow,
};
