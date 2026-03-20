const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

let r2Client = null;

/** Railway/панели часто дают пробел в конце — без trim клиент «есть», Put падает */
function trimEnv(v) {
    if (v == null) return '';
    return String(v).trim();
}

function normalizeBase(b) {
    if (!b || typeof b !== 'string') return '';
    return b.trim().replace(/\/+$/, '');
}

/** https://host или https:// + R2_PUBLIC_DOMAIN без схемы */
function expandPublicBase(b) {
    const t = normalizeBase(b);
    if (!t) return '';
    if (t.startsWith('http://') || t.startsWith('https://')) return t;
    return `https://${t}`;
}

function getPublicBaseCandidates() {
    const raw = [
        process.env.R2_PUBLIC_BASE_URL,
        process.env.R2_CDN_BASE_URL,
        process.env.R2_PUBLIC_DOMAIN,
    ];
    const out = [];
    for (const r of raw) {
        const e = expandPublicBase(r);
        if (e && !out.includes(e)) out.push(e);
    }
    return out;
}

/** Список отсутствующих env (имена), без значений — для логов при старте */
function getR2ConfigGaps() {
    const t = (v) => (v != null && String(v).trim() !== '' ? String(v).trim() : '');
    const missing = [];
    if (!t(process.env.R2_BUCKET_NAME)) missing.push('R2_BUCKET_NAME');
    if (!t(process.env.R2_ACCESS_KEY_ID)) missing.push('R2_ACCESS_KEY_ID');
    if (!t(process.env.R2_SECRET_ACCESS_KEY) && !t(process.env.SecretAccessKey)) {
        missing.push('R2_SECRET_ACCESS_KEY');
    }
    const hasEp = t(process.env.R2_ENDPOINT) || t(process.env.S3_API_URL);
    if (!hasEp && !t(process.env.R2_ACCOUNT_ID)) {
        missing.push('R2_ENDPOINT или R2_ACCOUNT_ID');
    }
    return missing;
}

/**
 * Клиент Cloudflare R2 (S3-совместимый). null, если env не задан.
 */
function getR2Client() {
    const bucketName = trimEnv(process.env.R2_BUCKET_NAME);
    const accessKeyId = trimEnv(process.env.R2_ACCESS_KEY_ID);
    const secretAccessKey = trimEnv(process.env.R2_SECRET_ACCESS_KEY || process.env.SecretAccessKey);
    const s3EndpointFromEnv = trimEnv(process.env.R2_ENDPOINT || process.env.S3_API_URL);
    const accountId = trimEnv(process.env.R2_ACCOUNT_ID);

    if (!bucketName || !accessKeyId || !secretAccessKey || (!s3EndpointFromEnv && !accountId)) {
        return null;
    }

    if (!r2Client) {
        const endpoint = s3EndpointFromEnv || `https://${accountId}.r2.cloudflarestorage.com`;
        r2Client = new S3Client({
            region: 'auto',
            endpoint,
            credentials: { accessKeyId, secretAccessKey },
        });
    }

    return r2Client;
}

function isR2ClientReady() {
    return getR2Client() != null;
}

/** Есть клиент + публичный URL для отдачи ссылок после PUT */
function isR2PublicUrlReady() {
    if (!isR2ClientReady()) return false;
    return getPublicBaseCandidates().length > 0;
}

/**
 * Публичный URL объекта по ключу (как после uploadPublicFile).
 */
function publicUrlFromKey(key) {
    const bases = getPublicBaseCandidates();
    if (!bases.length) return null;
    const k = String(key).replace(/^\/+/, '');
    return `${bases[0]}/${k}`;
}

/**
 * Если storedUrl — наш CDN/R2 public URL, вернуть S3 key; иначе null.
 */
function keyFromPublicUrl(storedUrl) {
    if (!storedUrl || typeof storedUrl !== 'string') return null;
    const trimmed = storedUrl.trim();
    if (!/^https?:\/\//i.test(trimmed)) return null;
    for (const base of getPublicBaseCandidates()) {
        const prefix = `${base}/`;
        if (trimmed.startsWith(prefix)) {
            return trimmed.slice(prefix.length).split('?')[0];
        }
    }
    return null;
}

/**
 * Загрузка в R2. Сначала PutObject, затем сборка публичного URL из R2_PUBLIC_*.
 * Если ключи к R2 есть, а публичного префикса нет — объект откатываем (Delete), чтобы не копить мусор и не врать фолбэком на диск.
 * Без ACL: у R2 x-amz-acl часто NotImplemented.
 * @returns {{ ok: true, url: string, storage: 'r2' } | { ok: false, reason: string, detail?: string }}
 */
async function uploadPublicFile({ key, body, contentType }) {
    const client = getR2Client();
    if (!client) {
        return { ok: false, reason: 'r2_not_configured' };
    }

    const bucket = trimEnv(process.env.R2_BUCKET_NAME);
    const k = String(key).replace(/^\/+/, '');

    try {
        await client.send(
            new PutObjectCommand({
                Bucket: bucket,
                Key: k,
                Body: body,
                ContentType: contentType || 'application/octet-stream',
                CacheControl: 'public, max-age=31536000',
            })
        );
    } catch (err) {
        const msg = err.message || String(err);
        console.error('[R2] PutObject failed:', msg);
        return { ok: false, reason: 'r2_put_failed', detail: msg };
    }

    const bases = getPublicBaseCandidates();
    if (bases.length) {
        const url = `${bases[0]}/${k}`;
        return { ok: true, url, storage: 'r2' };
    }

    console.warn(
        `[R2] PutObject OK для ключа ${k}, но нет R2_PUBLIC_BASE_URL / R2_CDN_BASE_URL / R2_PUBLIC_DOMAIN — удаляю объект`
    );
    try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: k }));
    } catch (delErr) {
        const dm = delErr.message || String(delErr);
        console.error('[R2] DeleteObject (откат после отсутствия публичного URL) failed:', dm);
    }

    return {
        ok: false,
        reason: 'r2_public_url_missing',
        detail:
            'Задай в окружении хотя бы одну переменную: R2_PUBLIC_BASE_URL, R2_CDN_BASE_URL или R2_PUBLIC_DOMAIN (см. docs/env-cloudflare-r2.md).',
    };
}

/**
 * Подписанный GET (для приватного бакета или временного доступа).
 * @param {string} key
 * @param {number} [expiresIn] секунды, по умолчанию 900
 */
async function getSignedGetObjectUrl(key, expiresIn = 900) {
    const client = getR2Client();
    if (!client) {
        return { ok: false, reason: 'r2_not_configured' };
    }
    const bucket = trimEnv(process.env.R2_BUCKET_NAME);
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const url = await getSignedUrl(client, cmd, { expiresIn });
    return { ok: true, url, expiresIn };
}

/**
 * Скачать объект в Buffer (рендер PDF на сервере и т.п.).
 */
async function getObjectBuffer(key) {
    const client = getR2Client();
    if (!client) {
        return { ok: false, reason: 'r2_not_configured' };
    }
    const out = await client.send(
        new GetObjectCommand({
            Bucket: trimEnv(process.env.R2_BUCKET_NAME),
            Key: key,
        })
    );
    const chunks = [];
    for await (const chunk of out.Body) {
        chunks.push(chunk);
    }
    return { ok: true, buffer: Buffer.concat(chunks), contentType: out.ContentType };
}

async function deleteObjectByKey(key) {
    const client = getR2Client();
    if (!client) {
        return { ok: false, reason: 'r2_not_configured' };
    }
    await client.send(
        new DeleteObjectCommand({
            Bucket: trimEnv(process.env.R2_BUCKET_NAME),
            Key: key,
        })
    );
    return { ok: true };
}

/** В проде можно выставить STORAGE_REQUIRE_R2=1 — без R2 загрузки не падаем на диск, а 503 */
function isStorageUploadRequireR2() {
    const v = process.env.STORAGE_REQUIRE_R2;
    return v === '1' || v === 'true' || v === 'yes';
}

/** Выдавать подписанный URL для чтения обложки вместо прямого CDN (если бакет приватный) */
function shouldSignCoverReadUrl() {
    const v = process.env.R2_SIGN_COVER_URL;
    return v === '1' || v === 'true' || v === 'yes';
}

function signedCoverUrlTtlSec() {
    const n = parseInt(process.env.R2_SIGNED_URL_TTL_SEC || '900', 10);
    return Number.isFinite(n) && n > 60 ? n : 900;
}

module.exports = {
    getR2Client,
    getR2ConfigGaps,
    uploadPublicFile,
    getPublicBaseCandidates,
    publicUrlFromKey,
    keyFromPublicUrl,
    getSignedGetObjectUrl,
    getObjectBuffer,
    deleteObjectByKey,
    isR2ClientReady,
    isR2PublicUrlReady,
    isStorageUploadRequireR2,
    shouldSignCoverReadUrl,
    signedCoverUrlTtlSec,
};
