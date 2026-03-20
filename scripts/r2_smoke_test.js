/**
 * Проверка интеграции Cloudflare R2 без поднятия сервера.
 *
 * Берёт переменные из .env в корне проекта (как server.js).
 * Запуск из корня: npm run r2:smoke
 *
 * Не печатает секреты; при успехе кладёт тестовый объект и по умолчанию удаляет его.
 * R2_SMOKE_KEEP=1 — оставить объект (ключ в выводе).
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const {
    getR2Client,
    getPublicBaseCandidates,
    uploadPublicFile,
    deleteObjectByKey,
    isR2ClientReady,
    isR2PublicUrlReady,
} = require('../src/utils/r2Client');

function mask(s) {
    if (!s || typeof s !== 'string') return '(нет)';
    if (s.length <= 6) return '***';
    return `${s.slice(0, 3)}…${s.slice(-3)}`;
}

function line(label, ok, detail) {
    const mark = ok ? 'OK' : '—';
    console.log(`[${mark}] ${label}${detail != null ? `: ${detail}` : ''}`);
}

async function main() {
    console.log('=== R2 smoke (Cloudflare S3 API) ===\n');

    const bucket = process.env.R2_BUCKET_NAME;
    const hasKey = !!(process.env.R2_ACCESS_KEY_ID && String(process.env.R2_ACCESS_KEY_ID).trim());
    const hasSecret = !!(
        (process.env.R2_SECRET_ACCESS_KEY && String(process.env.R2_SECRET_ACCESS_KEY).trim()) ||
        (process.env.SecretAccessKey && String(process.env.SecretAccessKey).trim())
    );
    const endpoint =
        process.env.R2_ENDPOINT ||
        process.env.S3_API_URL ||
        (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : '');

    line('R2_BUCKET_NAME', !!bucket, bucket || 'не задан');
    line('R2_ACCESS_KEY_ID', hasKey, hasKey ? mask(process.env.R2_ACCESS_KEY_ID) : '');
    line('R2_SECRET_ACCESS_KEY (или SecretAccessKey)', hasSecret, hasSecret ? 'задан' : '');
    line('endpoint (R2_ENDPOINT / ACCOUNT_ID)', !!endpoint, endpoint || 'не собрать');

    const bases = getPublicBaseCandidates();
    line(
        'публичная база (R2_PUBLIC_* )',
        bases.length > 0,
        bases[0] || 'нужна хотя бы одна из R2_PUBLIC_BASE_URL / R2_CDN_BASE_URL / R2_PUBLIC_DOMAIN'
    );

    console.log('');
    line('клиент S3 собран', isR2ClientReady(), '');
    line('готово к uploadPublicFile', isR2PublicUrlReady(), '');

    if (!isR2ClientReady() || !isR2PublicUrlReady()) {
        console.log('\nСтоп: без полного набора PutObject в бэке тоже не пройдёт. См. docs/env-cloudflare-r2.md');
        process.exit(1);
    }

    const key = `diagnostics/r2-smoke-${Date.now()}.txt`;
    const body = Buffer.from(`r2 smoke ${new Date().toISOString()}\n`, 'utf8');

    console.log(`\nPutObject: ${key} (${body.length} bytes)…`);
    const up = await uploadPublicFile({
        key,
        body,
        contentType: 'text/plain; charset=utf-8',
    });

    if (!up.ok) {
        console.error('Результат:', up);
        console.error('\nВ логах Railway это же будет как [R2] PutObject failed или предупреждение про R2_PUBLIC_*');
        process.exit(2);
    }

    console.log('PutObject OK');
    console.log('Публичный URL (проверь в браузере / curl):', up.url);

    const keep = process.env.R2_SMOKE_KEEP === '1' || process.env.R2_SMOKE_KEEP === 'true';
    if (keep) {
        console.log('\nR2_SMOKE_KEEP=1 — объект не удаляю.');
        process.exit(0);
    }

    const del = await deleteObjectByKey(key);
    if (!del.ok) {
        console.warn('DeleteObject:', del);
    } else {
        console.log('DeleteObject OK (тестовый ключ убран)');
    }

    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(3);
});
