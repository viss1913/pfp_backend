const fs = require('fs');
const path = require('path');
const Joi = require('joi');
const agentService = require('../services/agentService');
const agentNetworkService = require('../services/agentNetworkService');
const projectService = require('../services/projectService');
const emailService = require('../services/emailService');
const agentInviteService = require('../services/agentInviteService');
const { uploadPublicFile, isStorageUploadRequireR2, isR2ClientReady } = require('../utils/r2Client');
const { bufferToWebp } = require('../utils/imageToWebp');
const { buildAgentRegistrationInviteUrl } = require('../utils/agentRegistrationInviteUrl');
const authService = require('../services/authService');
const agentPartnerIdWizardService = require('../services/agentPartnerIdWizardService');

const partnerIdWizardSchema = Joi.object({
    action: Joi.string().valid('set', 'skip').required(),
    partner_agent_id: Joi.string().max(64).allow('').optional(),
    partner_ref_url: Joi.string().max(2048).allow('').optional(),
});

const subagentInviteEmailSchema = Joi.object({
    to_email: Joi.string().email({ tlds: { allow: false } }).required(),
    recipient_name: Joi.string().max(255).allow('').optional(),
});

const familyOfficeInviteSchema = Joi.object({
    email: Joi.string().email({ tlds: { allow: false } }).required(),
    first_name: Joi.string().max(100).required(),
    last_name: Joi.string().max(100).required(),
    phone: Joi.string().max(50).required(),
    middle_name: Joi.string().max(100).allow('').optional(),
    birth_date: Joi.string().isoDate().allow('').optional(),
    gender: Joi.string()
        .valid('male', 'female', 'M', 'F', 'мужской', 'женский')
        .allow('')
        .optional(),
    source_note: Joi.string().max(500).allow('').optional(),
});

class AgentController {
    /**
     * GET /api/agents
     * Sync endpoint for SMM service
     */
    async getAll(req, res, next) {
        try {
            const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
            if (!isAdmin && !req.user.isApiKey) {
                return res.status(403).json({ error: 'Forbidden: Admin or API Key required' });
            }

            const projectId = req.projectId || req.user?.projectId;
            const filters = {
                updated_since: req.query.updated_since,
                is_active: req.query.is_active
            };

            const agents = await agentService.getAllAgentsForSync(projectId, filters);
            res.json(agents);
        } catch (err) {
            next(err);
        }
    }

    /**
     * POST /api/agents
     * Create a new agent profile
     */
    async create(req, res, next) {
        try {
            const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
            if (!isAdmin) {
                return res.status(403).json({ error: 'Forbidden: Admin role required' });
            }

            const projectId = req.projectId || req.user?.projectId;
            const newAgent = await agentService.createAgent(projectId, req.body);
            res.status(201).json(newAgent);
        } catch (err) {
            next(err);
        }
    }

    /**
     * GET /api/agents/:id
     */
    async getById(req, res, next) {
        try {
            const projectId = req.projectId || req.user?.projectId;
            const agent = await agentService.getAgentById(req.params.id, projectId);
            if (!agent) {
                return res.status(404).json({ error: 'Agent not found' });
            }
            res.json(agent);
        } catch (err) {
            next(err);
        }
    }

    /**
     * PATCH /api/agents/:id
     * Update agent details (including SMM specific fields)
     */
    async update(req, res, next) {
        try {
            const agentId = req.params.id;
            const projectId = req.projectId || req.user?.projectId;
            const isAdmin = ['admin', 'super_admin'].includes(req.user.role);

            // Check permissions: admin or the agent themselves
            if (!isAdmin && req.user.agentId !== parseInt(agentId)) {
                return res.status(403).json({ error: 'Forbidden' });
            }

            const updatedAgent = await agentService.updateAgent(agentId, projectId, req.body);
            res.json(updatedAgent);
        } catch (err) {
            next(err);
        }
    }

    /**
     * POST /api/pfp/agents/:id/signature-upload
     * multipart field `image` (jpeg, png, webp, max 8MB) → R2 или локальный fallback, URL в agents.signature_image_url
     */
    async getMySubagents(req, res, next) {
        try {
            const projectId = req.projectId || req.user?.projectId;
            const agentId = Number(req.user?.agentId);
            if (!Number.isFinite(agentId) || agentId <= 0) {
                return res.status(403).json({ error: 'Forbidden' });
            }
            const list = await agentNetworkService.listSubagents(agentId, projectId);
            res.json({ data: list });
        } catch (err) {
            next(err);
        }
    }

    async completePartnerIdWizard(req, res, next) {
        try {
            const validation = partnerIdWizardSchema.validate(req.body);
            if (validation.error) {
                return res.status(400).json({ error: validation.error.details[0].message });
            }

            const projectId = req.projectId || req.user?.projectId;
            const agentId = Number(req.user?.agentId);
            if (!Number.isFinite(agentId) || agentId <= 0) {
                return res.status(403).json({ error: 'Forbidden' });
            }

            const wizardResult = await agentPartnerIdWizardService.completePartnerIdWizard(
                agentId,
                projectId,
                validation.value
            );
            const profile = await authService.getAgentMeProfile(agentId, projectId);

            res.json({
                message:
                    validation.value.action === 'skip'
                        ? 'Используется Finam ID куратора'
                        : 'Finam ID сохранён',
                ...wizardResult,
                ...(profile || {}),
            });
        } catch (err) {
            next(err);
        }
    }

    async getInviteLink(req, res, next) {
        try {
            const projectId = req.projectId || req.user?.projectId;
            const agentId = Number(req.user?.agentId);
            if (!Number.isFinite(agentId) || agentId <= 0) {
                return res.status(403).json({ error: 'Forbidden' });
            }
            const payload = await this._buildInviteLinkPayload(agentId, projectId);
            res.json(payload);
        } catch (err) {
            next(err);
        }
    }

    async sendFamilyOfficeInvite(req, res, next) {
        try {
            const validation = familyOfficeInviteSchema.validate(req.body);
            if (validation.error) {
                return res.status(400).json({ error: validation.error.details[0].message });
            }

            const projectId = req.projectId || req.user?.projectId;
            const agentId = Number(req.user?.agentId);
            if (!Number.isFinite(agentId) || agentId <= 0) {
                return res.status(403).json({ error: 'Forbidden' });
            }

            const inviter = await agentService.getAgentById(agentId, projectId);
            if (!inviter) {
                return res.status(404).json({ error: 'Agent not found' });
            }

            const result = await agentInviteService.provisionFamilyOfficeInvite(
                agentId,
                projectId,
                validation.value,
                inviter
            );
            res.status(201).json(result);
        } catch (err) {
            next(err);
        }
    }

    async sendSubagentInviteEmail(req, res, next) {
        try {
            const validation = subagentInviteEmailSchema.validate(req.body);
            if (validation.error) {
                return res.status(400).json({ error: validation.error.details[0].message });
            }

            const projectId = req.projectId || req.user?.projectId;
            const agentId = Number(req.user?.agentId);
            if (!Number.isFinite(agentId) || agentId <= 0) {
                return res.status(403).json({ error: 'Forbidden' });
            }

            const inviter = await agentService.getAgentById(agentId, projectId);
            if (!inviter) {
                return res.status(404).json({ error: 'Agent not found' });
            }

            const { url, referral_slug: slug, ref } = await this._buildInviteLinkPayload(
                agentId,
                projectId,
                inviter
            );

            const inviterFullName =
                [inviter.first_name, inviter.last_name].filter(Boolean).join(' ').trim() || 'Агент';

            await emailService.sendSubagentInviteEmail({
                to: validation.value.to_email,
                inviteUrl: url,
                inviterFullName,
                inviterEmail: inviter.email,
                inviterAgent: {
                    id: inviter.id,
                    email: inviter.email,
                    email_corp: inviter.email_corp,
                },
                recipientName: validation.value.recipient_name,
            });

            res.json({
                message: 'Приглашение отправлено',
                to_email: validation.value.to_email,
                url,
                referral_slug: slug,
                ref,
            });
        } catch (err) {
            next(err);
        }
    }

    async _buildInviteLinkPayload(agentId, projectId, inviterRow = null) {
        const slug = await agentNetworkService.ensureReferralSlug(agentId);
        const project = await projectService.getProjectById(projectId);
        if (!project?.public_key) {
            throw { status: 500, message: 'У проекта не задан public_key' };
        }

        const inviter = inviterRow || (await agentService.getAgentById(agentId, projectId));
        const url = buildAgentRegistrationInviteUrl({
            projectPublicKey: project.public_key,
            referralRef: slug,
            inviterPartnerAgentId: inviter?.partner_agent_id || null,
        });

        return { url, referral_slug: slug, ref: slug };
    }

    async getSubagentsById(req, res, next) {
        try {
            const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
            if (!isAdmin) {
                return res.status(403).json({ error: 'Forbidden' });
            }
            const projectId = req.projectId || req.user?.projectId;
            const parentId = Number(req.params.id);
            const list = await agentNetworkService.listSubagents(parentId, projectId);
            res.json({ data: list });
        } catch (err) {
            next(err);
        }
    }

    async uploadSignatureImage(req, res, next) {
        try {
            const agentId = req.params.id;
            const projectId = req.projectId || req.user?.projectId;
            const isAdmin = ['admin', 'super_admin'].includes(req.user.role);

            if (!isAdmin && req.user.agentId !== parseInt(agentId, 10)) {
                return res.status(403).json({ error: 'Forbidden' });
            }

            if (!req.file || !req.file.buffer) {
                return res.status(400).json({
                    error: 'No file uploaded. Use multipart field name "image" (jpeg, png, webp, max 8MB).',
                });
            }

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
                    console.warn('[Agent] PNG→WebP failed, оригинал PNG:', e.message);
                    uploadBody = req.file.buffer;
                    ext = '.png';
                    contentType = 'image/png';
                }
            }

            const pid = projectId != null ? String(projectId) : 'common';
            const key = `agent-signatures/${pid}/${agentId}/signature_${Date.now()}${ext}`;

            const up = await uploadPublicFile({
                key,
                body: uploadBody,
                contentType,
            });

            if (!up.ok) {
                console.warn('[Agent] R2 signature upload failed:', up.reason, up.detail || '');
            }

            let publicUrl;
            if (up.ok) {
                publicUrl = up.url;
            } else if (up.reason === 'r2_public_url_missing' || (isR2ClientReady() && up.reason === 'r2_put_failed')) {
                return res.status(503).json({
                    error:
                        up.reason === 'r2_public_url_missing'
                            ? 'R2: не задан публичный URL (R2_PUBLIC_BASE_URL / R2_CDN_BASE_URL / R2_PUBLIC_DOMAIN). См. docs/env-cloudflare-r2.md'
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
                const dir = path.join(__dirname, '../../uploads/agent-signatures', pid, String(agentId));
                fs.mkdirSync(dir, { recursive: true });
                const fname = `signature_${Date.now()}${ext}`;
                const full = path.join(dir, fname);
                fs.writeFileSync(full, uploadBody);
                const baseUrl = `${req.protocol}://${req.get('host')}`;
                publicUrl = `${baseUrl}/uploads/agent-signatures/${pid}/${agentId}/${fname}`;
            }

            const agent = await agentService.updateAgent(agentId, projectId, {
                signature_image_url: publicUrl,
            });

            res.status(201).json({
                url: publicUrl,
                signature_image_url: publicUrl,
                agent,
            });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new AgentController();
