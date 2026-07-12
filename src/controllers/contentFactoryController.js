const contentFactoryService = require('../services/contentFactoryService');

function projectIdOf(req) {
    return req.projectId || req.user?.projectId;
}

function agentIdOf(req) {
    const agentId = req.user?.agentId;
    if (agentId) return agentId;
    const role = String(req.user?.role || '').toLowerCase();
    if (role === 'admin' || role === 'super_admin' || req.user?.isAdmin) {
        return null;
    }
    return req.user?.id || null;
}

function requireAgentId(req, res) {
    const agentId = agentIdOf(req);
    if (!agentId) {
        res.status(400).json({
            error: 'agentId is required (agent JWT). Admin cannot create agent presentations without agent context.',
        });
        return null;
    }
    return agentId;
}

function handleError(res, error, label) {
    const status = error.statusCode || 500;
    if (status >= 500) console.error(`[ContentFactory] ${label}:`, error);
    res.status(status).json({ error: error.message || label });
}

class ContentFactoryController {
    // ── Admin templates ────────────────────────────────────

    async listTemplates(req, res) {
        try {
            const projectId = projectIdOf(req);
            if (!projectId) return res.status(400).json({ error: 'projectId is required' });
            const rows = await contentFactoryService.listTemplates(projectId);
            res.json(rows);
        } catch (e) {
            handleError(res, e, 'listTemplates');
        }
    }

    async getTemplate(req, res) {
        try {
            const projectId = projectIdOf(req);
            const row = await contentFactoryService.getTemplate(projectId, req.params.id);
            if (!row) return res.status(404).json({ error: 'Template not found' });
            res.json(row);
        } catch (e) {
            handleError(res, e, 'getTemplate');
        }
    }

    async createTemplate(req, res) {
        try {
            const projectId = projectIdOf(req);
            if (!projectId) return res.status(400).json({ error: 'projectId is required' });
            const row = await contentFactoryService.createTemplate(projectId, req.body || {});
            res.status(201).json(row);
        } catch (e) {
            handleError(res, e, 'createTemplate');
        }
    }

    async updateTemplate(req, res) {
        try {
            const projectId = projectIdOf(req);
            const row = await contentFactoryService.updateTemplate(projectId, req.params.id, req.body || {});
            res.json(row);
        } catch (e) {
            handleError(res, e, 'updateTemplate');
        }
    }

    async deleteTemplate(req, res) {
        try {
            const projectId = projectIdOf(req);
            await contentFactoryService.deleteTemplate(projectId, req.params.id);
            res.json({ ok: true });
        } catch (e) {
            handleError(res, e, 'deleteTemplate');
        }
    }

    // ── Admin offers ───────────────────────────────────────

    async listOffers(req, res) {
        try {
            const projectId = projectIdOf(req);
            if (!projectId) return res.status(400).json({ error: 'projectId is required' });
            await contentFactoryService.expireOffers(projectId);
            const rows = await contentFactoryService.listOffers(projectId, {
                status: req.query.status,
                includeExpired: req.query.include_expired !== '0',
            });
            res.json(rows);
        } catch (e) {
            handleError(res, e, 'listOffers');
        }
    }

    async getOffer(req, res) {
        try {
            const projectId = projectIdOf(req);
            const row = await contentFactoryService.getOffer(projectId, req.params.id);
            if (!row) return res.status(404).json({ error: 'Offer not found' });
            res.json(row);
        } catch (e) {
            handleError(res, e, 'getOffer');
        }
    }

    async createOffer(req, res) {
        try {
            const projectId = projectIdOf(req);
            if (!projectId) return res.status(400).json({ error: 'projectId is required' });
            const row = await contentFactoryService.createOffer(
                projectId,
                req.body || {},
                req.user?.id,
            );
            res.status(201).json(row);
        } catch (e) {
            handleError(res, e, 'createOffer');
        }
    }

    async updateOffer(req, res) {
        try {
            const projectId = projectIdOf(req);
            const row = await contentFactoryService.updateOffer(projectId, req.params.id, req.body || {});
            res.json(row);
        } catch (e) {
            handleError(res, e, 'updateOffer');
        }
    }

    async generateOffer(req, res) {
        try {
            const projectId = projectIdOf(req);
            const useLlm = req.body?.use_llm === true || req.query.use_llm === '1';
            const row = await contentFactoryService.generateOfferHtml(projectId, req.params.id, { useLlm });
            res.json(row);
        } catch (e) {
            handleError(res, e, 'generateOffer');
        }
    }

    async publishOffer(req, res) {
        try {
            const projectId = projectIdOf(req);
            const row = await contentFactoryService.publishOffer(projectId, req.params.id);
            res.json(row);
        } catch (e) {
            handleError(res, e, 'publishOffer');
        }
    }

    async unpublishOffer(req, res) {
        try {
            const projectId = projectIdOf(req);
            const row = await contentFactoryService.unpublishOffer(projectId, req.params.id);
            res.json(row);
        } catch (e) {
            handleError(res, e, 'unpublishOffer');
        }
    }

    async archiveOffer(req, res) {
        try {
            const projectId = projectIdOf(req);
            const row = await contentFactoryService.archiveOffer(projectId, req.params.id);
            res.json(row);
        } catch (e) {
            handleError(res, e, 'archiveOffer');
        }
    }

    async listChat(req, res) {
        try {
            const projectId = projectIdOf(req);
            const rows = await contentFactoryService.listChatMessages(projectId, req.params.id);
            res.json(rows);
        } catch (e) {
            handleError(res, e, 'listChat');
        }
    }

    async postChat(req, res) {
        try {
            const projectId = projectIdOf(req);
            const content = req.body?.content || req.body?.message;
            if (!content || !String(content).trim()) {
                return res.status(400).json({ error: 'content is required' });
            }
            const result = await contentFactoryService.postChatMessage(
                projectId,
                req.params.id,
                String(content).trim(),
            );
            res.json(result);
        } catch (e) {
            handleError(res, e, 'postChat');
        }
    }

    // ── Agent catalog & presentations ──────────────────────

    async agentListOffers(req, res) {
        try {
            const projectId = projectIdOf(req);
            if (!projectId) return res.status(400).json({ error: 'projectId is required' });
            await contentFactoryService.expireOffers(projectId);
            const rows = await contentFactoryService.listPublishedOffers(projectId);
            res.json(rows);
        } catch (e) {
            handleError(res, e, 'agentListOffers');
        }
    }

    async agentGetOffer(req, res) {
        try {
            const projectId = projectIdOf(req);
            const row = await contentFactoryService.getOffer(projectId, req.params.id);
            if (!row || row.status !== 'published') {
                return res.status(404).json({ error: 'Offer not found' });
            }
            if (row.expires_at && new Date(row.expires_at) <= new Date()) {
                return res.status(404).json({ error: 'Offer expired' });
            }
            res.json(row);
        } catch (e) {
            handleError(res, e, 'agentGetOffer');
        }
    }

    async listPresentations(req, res) {
        try {
            const projectId = projectIdOf(req);
            const agentId = requireAgentId(req, res);
            if (!projectId || !agentId) {
                if (!res.headersSent) return res.status(400).json({ error: 'project and agent required' });
                return;
            }
            const rows = await contentFactoryService.listPresentations(projectId, agentId);
            res.json(rows);
        } catch (e) {
            handleError(res, e, 'listPresentations');
        }
    }

    async getPresentation(req, res) {
        try {
            const projectId = projectIdOf(req);
            const agentId = requireAgentId(req, res);
            if (!agentId) return;
            const row = await contentFactoryService.getPresentation(projectId, agentId, req.params.id);
            if (!row) return res.status(404).json({ error: 'Presentation not found' });
            res.json(row);
        } catch (e) {
            handleError(res, e, 'getPresentation');
        }
    }

    async createPresentation(req, res) {
        try {
            const projectId = projectIdOf(req);
            const agentId = requireAgentId(req, res);
            if (!projectId || !agentId) {
                if (!res.headersSent) return res.status(400).json({ error: 'project and agent required' });
                return;
            }
            const row = await contentFactoryService.createPresentation(projectId, agentId, req.body || {});
            res.status(201).json(row);
        } catch (e) {
            handleError(res, e, 'createPresentation');
        }
    }

    async updatePresentation(req, res) {
        try {
            const projectId = projectIdOf(req);
            const agentId = requireAgentId(req, res);
            if (!agentId) return;
            const row = await contentFactoryService.updatePresentation(
                projectId,
                agentId,
                req.params.id,
                req.body || {},
            );
            res.json(row);
        } catch (e) {
            handleError(res, e, 'updatePresentation');
        }
    }

    async generatePdf(req, res) {
        try {
            const projectId = projectIdOf(req);
            const agentId = agentIdOf(req);
            const result = await contentFactoryService.generatePresentationPdf(
                projectId,
                agentId,
                req.params.id,
            );
            if (req.query.download === '1') {
                const buf = Buffer.from(result.pdf_base64, 'base64');
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader(
                    'Content-Disposition',
                    `attachment; filename="presentation-${req.params.id}.pdf"`,
                );
                return res.send(buf);
            }
            res.json(result);
        } catch (e) {
            handleError(res, e, 'generatePdf');
        }
    }

    async emailDraft(req, res) {
        try {
            const projectId = projectIdOf(req);
            const agentId = requireAgentId(req, res);
            if (!agentId) return;
            const row = await contentFactoryService.draftPresentationEmail(
                projectId,
                agentId,
                req.params.id,
            );
            res.json(row);
        } catch (e) {
            handleError(res, e, 'emailDraft');
        }
    }

    async sendPresentation(req, res) {
        try {
            const projectId = projectIdOf(req);
            const agentId = requireAgentId(req, res);
            if (!agentId) return;
            const result = await contentFactoryService.sendPresentationEmail(
                projectId,
                agentId,
                req.params.id,
                { to: req.body?.to },
            );
            res.json(result);
        } catch (e) {
            handleError(res, e, 'sendPresentation');
        }
    }
}

module.exports = new ContentFactoryController();
