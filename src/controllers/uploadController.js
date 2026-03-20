const fs = require('fs');
const path = require('path');
const knex = require('../config/database');
const { uploadPublicFile, isStorageUploadRequireR2 } = require('../utils/r2Client');

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

            const projectId = req.user?.projectId || 'common';

            const ext = path.extname(req.file.originalname || '') || '.webp';
            const key = `ai-b2c-avatars/${projectId}/avatar_${Date.now()}${ext}`;
            let body = req.file.buffer || req.file.stream;
            if (!body && req.file.path) {
                body = fs.createReadStream(req.file.path);
            }
            if (!body) {
                return res.status(500).json({ error: 'Cannot read uploaded file' });
            }
            const up = await uploadPublicFile({
                key,
                body,
                contentType: req.file.mimetype || 'image/webp',
            });

            if (!up.ok) {
                console.warn('[Upload] R2 avatar upload skipped:', up.reason, up.detail || '');
            }

            if (up.ok) {
                const url = up.url;

                // Бэкенд рулит: сразу записываем R2‑URL в ai_b2c_settings
                if (projectId && projectId !== 'common') {
                    try {
                        const existing = await knex('ai_b2c_settings')
                            .where({ project_id: projectId })
                            .first();

                        if (!existing) {
                            await knex('ai_b2c_settings').insert({
                                project_id: projectId,
                                display_name: 'AI-ассистент',
                                avatar_url: url,
                                tagline: null
                            });
                        } else {
                            await knex('ai_b2c_settings')
                                .where({ project_id: projectId })
                                .update({
                                    avatar_url: url,
                                    updated_at: knex.fn.now()
                                });
                        }
                    } catch (dbErr) {
                        console.error('[Upload] Failed to persist avatar_url to ai_b2c_settings:', dbErr);
                        // Не роняем аплоад, просто логируем
                    }
                }

                return res.status(201).json({ url });
            }

            if (isStorageUploadRequireR2()) {
                return res.status(503).json({
                    error: 'Cloudflare R2 is required (STORAGE_REQUIRE_R2) but upload failed',
                    code: 'STORAGE_R2_REQUIRED',
                    reason: up.reason || 'unknown',
                    detail: up.detail || undefined,
                });
            }

            if (up.reason === 'r2_public_url_missing') {
                return res.status(500).json({ error: 'R2_PUBLIC_BASE_URL (or R2_PUBLIC_DOMAIN) is not configured' });
            }

            // Fallback: старое поведение — локальный диск + /uploads
            const filePath = req.file.path;
            const relativePath = filePath.replace(path.join(__dirname, '..', '..'), '').replace(/\\/g, '/');
            const baseUrl = `${req.protocol}://${req.get('host')}`;
            const url = `${baseUrl}${relativePath.startsWith('/') ? '' : '/'}${relativePath}`;

            // Даже в фоллбэке сохраняем URL, чтобы фронт всегда читал его из настроек
            if (projectId && projectId !== 'common') {
                try {
                    const existing = await knex('ai_b2c_settings')
                        .where({ project_id: projectId })
                        .first();

                    if (!existing) {
                        await knex('ai_b2c_settings').insert({
                            project_id: projectId,
                            display_name: 'AI-ассистент',
                            avatar_url: url,
                            tagline: null
                        });
                    } else {
                        await knex('ai_b2c_settings')
                            .where({ project_id: projectId })
                            .update({
                                avatar_url: url,
                                updated_at: knex.fn.now()
                            });
                    }
                } catch (dbErr) {
                    console.error('[Upload] Failed to persist fallback avatar_url to ai_b2c_settings:', dbErr);
                }
            }

            res.status(201).json({ url });
        } catch (error) {
            console.error('[Upload] Avatar upload error:', error);
            res.status(500).json({ error: 'Failed to upload avatar' });
        }
    }
}

module.exports = new UploadController();

