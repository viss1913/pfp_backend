const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// Lazy-initialized S3 client for Cloudflare R2
let r2Client = null;

function getR2Client() {
    // Поддерживаем две схемы переменных:
    // 1) R2_ACCOUNT_ID + R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY + R2_BUCKET_NAME (+ R2_ENDPOINT)
    // 2) S3_API_URL + R2_BUCKET_NAME + R2_ACCESS_KEY_ID + SecretAccessKey

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
            credentials: {
                accessKeyId,
                secretAccessKey
            }
        });
    }

    return r2Client;
}

class UploadController {
    /**
     * POST /pfp/ai-b2c/avatar-upload
     *
     * Ожидает multipart/form-data с полем `image`.
     * Возвращает { url } — абсолютный URL до файла.
     */
    async uploadAiB2cAvatar(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded. Use field name "image".' });
            }

            const r2 = getR2Client();

            // Если R2 сконфигурен — грузим туда
            if (r2) {
                const bucket = process.env.R2_BUCKET_NAME;
                const projectId = req.user?.projectId || 'common';
                const ext = path.extname(req.file.originalname || '') || '.webp';
                const key = `ai-b2c-avatars/${projectId}/avatar_${Date.now()}${ext}`;

                await r2.send(new PutObjectCommand({
                    Bucket: bucket,
                    Key: key,
                    Body: req.file.buffer || req.file.stream || req.file,
                    ContentType: req.file.mimetype || 'image/webp',
                    ACL: 'public-read' // Cloudflare R2 игнорирует ACL, доступ настраивается на бакете
                }));

                const publicBase = process.env.R2_PUBLIC_BASE_URL || process.env.R2_CDN_BASE_URL || process.env.R2_PUBLIC_DOMAIN;
                if (!publicBase) {
                    return res.status(500).json({ error: 'R2_PUBLIC_BASE_URL (or R2_PUBLIC_DOMAIN) is not configured' });
                }

                const url = `${publicBase.replace(/\/$/, '')}/${key}`;
                return res.status(201).json({ url });
            }

            // Fallback: старое поведение — локальный диск + /uploads
            const filePath = req.file.path;
            const relativePath = filePath.replace(path.join(__dirname, '..', '..'), '').replace(/\\/g, '/');
            const baseUrl = `${req.protocol}://${req.get('host')}`;
            const url = `${baseUrl}${relativePath.startsWith('/') ? '' : '/'}${relativePath}`;

            res.status(201).json({ url });
        } catch (error) {
            console.error('[Upload] Avatar upload error:', error);
            res.status(500).json({ error: 'Failed to upload avatar' });
        }
    }
}

module.exports = new UploadController();

