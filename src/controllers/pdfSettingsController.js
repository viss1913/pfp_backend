const fs = require('fs');
const path = require('path');
const Joi = require('joi');
const pdfSettingsService = require('../services/pdfSettingsService');
const { uploadPublicFile, isStorageUploadRequireR2 } = require('../utils/r2Client');

const patchSchema = Joi.object({
    cover_background_url: Joi.string().allow('', null).max(2048),
    cover_title: Joi.string().allow('', null).max(500),
    title_band_color: Joi.string()
        .allow('', null)
        .max(16)
        .custom((value, helpers) => {
            if (value === '' || value == null) return value;
            if (!/^#[0-9A-Fa-f]{6}$/.test(value)) {
                return helpers.message('title_band_color must be #RRGGBB');
            }
            return value;
        }),
}).min(1);

class PdfSettingsController {
    /**
     * GET /pfp/pdf-settings — настройки обложки PDF для текущего агента.
     */
    async getMy(req, res) {
        try {
            const agentId = req.user.agentId;
            const projectId = req.projectId ?? req.user.projectId ?? null;
            const data = await pdfSettingsService.getByAgentId(agentId, projectId);
            const editor_schema = pdfSettingsService.getEditorSchema();
            res.json({ editor_schema, ...data });
        } catch (e) {
            const code = e.statusCode || 500;
            if (code === 500) console.error('[PdfSettings] getMy:', e);
            res.status(code).json({ error: e.message || 'Failed to load PDF settings' });
        }
    }

    /**
     * PATCH /pfp/pdf-settings — обновить (частично).
     */
    async patchMy(req, res) {
        try {
            const { error, value } = patchSchema.validate(req.body, { stripUnknown: true });
            if (error) {
                return res.status(400).json({ error: error.message });
            }
            const agentId = req.user.agentId;
            const projectId = req.projectId ?? req.user.projectId ?? null;
            const data = await pdfSettingsService.upsert(agentId, projectId, value);
            const editor_schema = pdfSettingsService.getEditorSchema();
            res.json({ editor_schema, ...data });
        } catch (e) {
            const code = e.statusCode || 500;
            if (code === 500) console.error('[PdfSettings] patchMy:', e);
            res.status(code).json({ error: e.message || 'Failed to update PDF settings' });
        }
    }

    /**
     * POST /pfp/pdf-settings/cover-background — multipart, поле `image`.
     * Грузит в R2 или в /uploads, записывает URL в настройки агента.
     */
    async uploadCoverBackground(req, res) {
        try {
            if (!req.file || !req.file.buffer) {
                return res.status(400).json({
                    error: 'No file uploaded. Use multipart field name "image" (jpeg, png, webp, max 8MB).',
                });
            }

            const agentId = req.user.agentId;
            const projectId = req.projectId ?? req.user.projectId ?? null;
            await pdfSettingsService.assertAgentInProject(agentId, projectId);

            let ext = path.extname(req.file.originalname || '').toLowerCase();
            if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
                ext = '.jpg';
            }

            const pid = projectId != null ? String(projectId) : 'common';
            const key = `pdf-report-covers/${pid}/${agentId}/cover_${Date.now()}${ext}`;

            const up = await uploadPublicFile({
                key,
                body: req.file.buffer,
                contentType: req.file.mimetype || 'image/jpeg',
            });

            if (!up.ok) {
                console.warn('[PdfSettings] R2 upload skipped:', up.reason, up.detail || '');
            }

            let publicUrl;
            if (up.ok) {
                publicUrl = up.url;
            } else if (isStorageUploadRequireR2()) {
                return res.status(503).json({
                    error: 'Cloudflare R2 is required (STORAGE_REQUIRE_R2) but upload failed',
                    code: 'STORAGE_R2_REQUIRED',
                    reason: up.reason || 'unknown',
                    detail: up.detail || undefined,
                });
            } else {
                const dir = path.join(__dirname, '../../uploads/pdf-report-covers', pid, String(agentId));
                fs.mkdirSync(dir, { recursive: true });
                const fname = `cover_${Date.now()}${ext}`;
                const full = path.join(dir, fname);
                fs.writeFileSync(full, req.file.buffer);
                const baseUrl = `${req.protocol}://${req.get('host')}`;
                publicUrl = `${baseUrl}/uploads/pdf-report-covers/${pid}/${agentId}/${fname}`;
            }

            const settings = await pdfSettingsService.upsert(agentId, projectId, {
                cover_background_url: publicUrl,
            });
            const editor_schema = pdfSettingsService.getEditorSchema();
            res.status(201).json({ url: publicUrl, editor_schema, ...settings });
        } catch (e) {
            const code = e.statusCode || 500;
            if (code === 500) console.error('[PdfSettings] uploadCoverBackground:', e);
            res.status(code).json({ error: e.message || 'Failed to upload cover background' });
        }
    }

    /**
     * GET /pfp/pdf-settings/cover-image — URL для превью/скачивания фона (прямой CDN или подписанный R2 GET).
     */
    async getCoverImageAccess(req, res) {
        try {
            const agentId = req.user.agentId;
            const projectId = req.projectId ?? req.user.projectId ?? null;
            const data = await pdfSettingsService.getCoverImageAccess(agentId, projectId);
            res.json(data);
        } catch (e) {
            const code = e.statusCode || 500;
            if (code === 500) console.error('[PdfSettings] getCoverImageAccess:', e);
            res.status(code).json({ error: e.message || 'Failed to resolve cover image URL' });
        }
    }
}

module.exports = new PdfSettingsController();
