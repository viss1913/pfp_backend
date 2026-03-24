const fs = require('fs');
const path = require('path');
const Joi = require('joi');
const pdfSettingsService = require('../services/pdfSettingsService');
const { uploadPublicFile, isStorageUploadRequireR2, isR2ClientReady } = require('../utils/r2Client');
const { bufferToWebp } = require('../utils/imageToWebp');

/**
 * Multipart `image` → R2 или диск → PATCH поля в pdf-settings.
 */
async function uploadPdfSettingImage(req, res, { patchKey, r2KeyPrefix, localDirName, filePrefix }) {
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

    let uploadBody = req.file.buffer;
    let contentType = req.file.mimetype || 'image/jpeg';
    if (ext === '.png' || contentType === 'image/png') {
        try {
            uploadBody = await bufferToWebp(uploadBody);
            ext = '.webp';
            contentType = 'image/webp';
        } catch (e) {
            console.warn('[PdfSettings] PNG→WebP failed, оригинал PNG:', e.message);
            uploadBody = req.file.buffer;
            ext = '.png';
            contentType = 'image/png';
        }
    }

    const pid = projectId != null ? String(projectId) : 'common';
    const key = `${r2KeyPrefix}/${pid}/${agentId}/${filePrefix}_${Date.now()}${ext}`;

    const up = await uploadPublicFile({
        key,
        body: uploadBody,
        contentType,
    });

    if (!up.ok) {
        console.warn('[PdfSettings] R2 upload failed:', up.reason, up.detail || '');
    }

    let publicUrl;
    let storage;
    if (up.ok) {
        publicUrl = up.url;
        storage = up.storage || 'r2';
    } else if (up.reason === 'r2_public_url_missing' || (isR2ClientReady() && up.reason === 'r2_put_failed')) {
        return res.status(503).json({
            error:
                up.reason === 'r2_public_url_missing'
                    ? 'R2: не задан публичный URL (R2_PUBLIC_BASE_URL, R2_CDN_BASE_URL или R2_PUBLIC_DOMAIN). Без него ссылку на файл не собрать — см. docs/env-cloudflare-r2.md'
                    : 'Загрузка в Cloudflare R2 не удалась (PutObject).',
            code: up.reason === 'r2_public_url_missing' ? 'R2_PUBLIC_URL_MISSING' : 'R2_PUT_FAILED',
            reason: up.reason,
            detail: up.detail || undefined,
        });
    } else if (isStorageUploadRequireR2()) {
        return res.status(503).json({
            error: 'Cloudflare R2 is required (STORAGE_REQUIRE_R2) but upload failed',
            code: 'STORAGE_R2_REQUIRED',
            reason: up.reason || 'unknown',
            detail: up.detail || undefined,
        });
    } else {
        const dir = path.join(__dirname, '../../uploads', localDirName, pid, String(agentId));
        fs.mkdirSync(dir, { recursive: true });
        const fname = `${filePrefix}_${Date.now()}${ext}`;
        const full = path.join(dir, fname);
        fs.writeFileSync(full, uploadBody);
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        publicUrl = `${baseUrl}/uploads/${localDirName}/${pid}/${agentId}/${fname}`;
        storage = 'local_disk';
    }

    const patch = { [patchKey]: publicUrl };
    const settings = await pdfSettingsService.upsert(agentId, projectId, patch);
    const editor_schema = pdfSettingsService.getEditorSchema();
    res.status(201).json({ url: publicUrl, storage, editor_schema, ...settings });
}

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
    summary_background_url: Joi.string().allow('', null).max(2048),
    summary_logo_url: Joi.string().allow('', null).max(2048),
    summary_chart_color: Joi.string()
        .allow('', null)
        .max(16)
        .custom((value, helpers) => {
            if (value === '' || value == null) return value;
            if (!/^#[0-9A-Fa-f]{6}$/.test(value)) {
                return helpers.message('summary_chart_color must be #RRGGBB');
            }
            return value;
        }),
    summary_ai_avatar_url: Joi.string().allow('', null).max(2048),
    summary_accent_color: Joi.string()
        .allow('', null)
        .max(16)
        .custom((value, helpers) => {
            if (value === '' || value == null) return value;
            if (!/^#[0-9A-Fa-f]{6}$/.test(value)) {
                return helpers.message('summary_accent_color must be #RRGGBB');
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
            await uploadPdfSettingImage(req, res, {
                patchKey: 'cover_background_url',
                r2KeyPrefix: 'pdf-report-covers',
                localDirName: 'pdf-report-covers',
                filePrefix: 'cover',
            });
        } catch (e) {
            const code = e.statusCode || 500;
            if (code === 500) console.error('[PdfSettings] uploadCoverBackground:', e);
            if (!res.headersSent) {
                res.status(code).json({ error: e.message || 'Failed to upload cover background' });
            }
        }
    }

    async uploadSummaryBackground(req, res) {
        try {
            await uploadPdfSettingImage(req, res, {
                patchKey: 'summary_background_url',
                r2KeyPrefix: 'pdf-report-summary',
                localDirName: 'pdf-report-summary',
                filePrefix: 'background',
            });
        } catch (e) {
            const code = e.statusCode || 500;
            if (code === 500) console.error('[PdfSettings] uploadSummaryBackground:', e);
            if (!res.headersSent) {
                res.status(code).json({ error: e.message || 'Failed to upload summary background' });
            }
        }
    }

    async uploadSummaryLogo(req, res) {
        try {
            await uploadPdfSettingImage(req, res, {
                patchKey: 'summary_logo_url',
                r2KeyPrefix: 'pdf-report-summary',
                localDirName: 'pdf-report-summary',
                filePrefix: 'logo',
            });
        } catch (e) {
            const code = e.statusCode || 500;
            if (code === 500) console.error('[PdfSettings] uploadSummaryLogo:', e);
            if (!res.headersSent) {
                res.status(code).json({ error: e.message || 'Failed to upload summary logo' });
            }
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

    async getSummaryBackgroundImageAccess(req, res) {
        try {
            const agentId = req.user.agentId;
            const projectId = req.projectId ?? req.user.projectId ?? null;
            const data = await pdfSettingsService.getSummaryBackgroundImageAccess(agentId, projectId);
            res.json(data);
        } catch (e) {
            const code = e.statusCode || 500;
            if (code === 500) console.error('[PdfSettings] getSummaryBackgroundImageAccess:', e);
            res.status(code).json({ error: e.message || 'Failed to resolve summary background URL' });
        }
    }

    async getSummaryLogoImageAccess(req, res) {
        try {
            const agentId = req.user.agentId;
            const projectId = req.projectId ?? req.user.projectId ?? null;
            const data = await pdfSettingsService.getSummaryLogoImageAccess(agentId, projectId);
            res.json(data);
        } catch (e) {
            const code = e.statusCode || 500;
            if (code === 500) console.error('[PdfSettings] getSummaryLogoImageAccess:', e);
            res.status(code).json({ error: e.message || 'Failed to resolve summary logo URL' });
        }
    }

    /**
     * GET /pfp/pdf-settings/summary-preview-html — HTML превью сводной (мок + настройки агента).
     */
    async getSummaryPreviewHtml(req, res) {
        try {
            const agentId = req.user.agentId;
            const projectId = req.projectId ?? req.user.projectId ?? null;
            const html = await pdfSettingsService.buildSummaryPreviewHtml(agentId, projectId);
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'private, no-store');
            res.send(html);
        } catch (e) {
            const code = e.statusCode || 500;
            if (code === 500) console.error('[PdfSettings] getSummaryPreviewHtml:', e);
            res.status(code).json({ error: e.message || 'Failed to build summary preview' });
        }
    }
}

module.exports = new PdfSettingsController();
