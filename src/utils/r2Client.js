const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

let r2Client = null;

/**
 * Клиент Cloudflare R2 (S3-совместимый). null, если env не задан.
 */
function getR2Client() {
    const bucketName = process.env.R2_BUCKET_NAME;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || process.env.SecretAccessKey;
    const s3EndpointFromEnv = process.env.R2_ENDPOINT || process.env.S3_API_URL;
    const accountId = process.env.R2_ACCOUNT_ID;

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

/**
 * Загрузка публичного объекта в R2.
 * @returns {{ ok: true, url: string } | { ok: false, reason: string }}
 */
async function uploadPublicFile({ key, body, contentType }) {
    const client = getR2Client();
    if (!client) {
        return { ok: false, reason: 'r2_not_configured' };
    }

    const bucket = process.env.R2_BUCKET_NAME;
    await client.send(
        new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: contentType || 'application/octet-stream',
            ACL: 'public-read',
        })
    );

    const publicBase =
        process.env.R2_PUBLIC_BASE_URL || process.env.R2_CDN_BASE_URL || process.env.R2_PUBLIC_DOMAIN;
    if (!publicBase) {
        return { ok: false, reason: 'r2_public_url_missing' };
    }

    const url = `${publicBase.replace(/\/$/, '')}/${key}`;
    return { ok: true, url };
}

module.exports = {
    getR2Client,
    uploadPublicFile,
};
