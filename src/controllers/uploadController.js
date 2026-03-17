const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// Lazy-initialized S3 client for Cloudflare R2
let r2Client = null;

function getR2Client() {
    if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) {
        return null;
    }

    if (!r2Client) {
        const accountId = process.env.R2_ACCOUNT_ID;
        const endpoint = process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`;

        r2Client = new S3Client({
            region: 'auto',
            endpoint,
            credentials: {
                accessKeyId: process.env.R2_ACCESS_KEY_ID,
                secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
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

                const publicBase = process.env.R2_PUBLIC_BASE_URL || process.env.R2_CDN_BASE_URL;
                if (!publicBase) {
                    return res.status(500).json({ error: 'R2_PUBLIC_BASE_URL is not configured' });
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

