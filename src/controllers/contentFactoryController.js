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

function wantsStream(req) {
    return (
        req.query.stream === '1' ||
        req.body?.stream === true ||
        String(req.headers.accept || '').includes('text/event-stream')
    );
}

function handleError(res, error, label) {
    const status = error.statusCode || 500;
    if (status >= 500) console.error(`[ContentFactory] ${label}:`, error);
    if (res.headersSent) return;
    res.status(status).json({
        error: error.message || label,
        code: error.code,
        details: error.details,
    });
}

class ContentFactoryController {
    async ideHealth(_req, res) {
        try {
            const data = await contentFactoryService.ideHealth();
            res.json(data);
        } catch (e) {
            handleError(res, e, 'ideHealth');
        }
    }

    async listTemplates(_req, res) {
        try {
            const data = await contentFactoryService.listTemplates();
            res.json(data);
        } catch (e) {
            handleError(res, e, 'listTemplates');
        }
    }

    async getTemplatePreview(req, res) {
        try {
            const { html } = await contentFactoryService.getTemplatePreview(req.params.templateId);
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'private, max-age=3600');
            res.send(html);
        } catch (e) {
            handleError(res, e, 'getTemplatePreview');
        }
    }

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
            let row = await contentFactoryService.getOffer(projectId, req.params.id);
            if (!row) return res.status(404).json({ error: 'Offer not found' });
            if (req.query.sync === '1') {
                row = await contentFactoryService.syncOfferFromIde(projectId, req.params.id);
            }
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
            const stream = wantsStream(req);
            if (stream) {
                res.status(200);
                res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
                res.setHeader('Cache-Control', 'no-cache, no-transform');
                res.setHeader('Connection', 'keep-alive');
                res.setHeader('X-Accel-Buffering', 'no');
            }
            const result = await contentFactoryService.postChatMessage(
                projectId,
                req.params.id,
                String(content).trim(),
                {
                    stream,
                    res: stream ? res : undefined,
                    attachments: req.body?.attachments,
                    files: req.body?.files,
                },
            );
            if (stream) {
                if (!res.writableEnded) res.end();
            } else {
                res.json(result);
            }
        } catch (e) {
            if (wantsStream(req) && !res.headersSent) {
                res.status(e.statusCode || 500);
                res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
                res.write(`event: error\ndata: ${JSON.stringify({ error: e.code || 'error', message: e.message })}\n\n`);
                res.end();
                return;
            }
            handleError(res, e, 'postChat');
        }
    }

    async uploadMedia(req, res) {
        try {
            const projectId = projectIdOf(req);
            const files = req.body?.files;
            if (!Array.isArray(files) || !files.length) {
                return res.status(400).json({ error: 'files array is required' });
            }
            const data = await contentFactoryService.uploadOfferMedia(projectId, req.params.id, files);
            res.status(201).json(data);
        } catch (e) {
            handleError(res, e, 'uploadMedia');
        }
    }

    async listMedia(req, res) {
        try {
            const projectId = projectIdOf(req);
            const data = await contentFactoryService.listOfferMedia(projectId, req.params.id);
            res.json(data);
        } catch (e) {
            handleError(res, e, 'listMedia');
        }
    }

    async agentListOffers(req, res) {
        try {
            const projectId = projectIdOf(req);
            if (!projectId) return res.status(400).json({ error: 'projectId is required' });
            await contentFactoryService.expireOffers(projectId);
            const rows = await contentFactoryService.listPublishedOffersForAgent(projectId);
            res.json(rows);
        } catch (e) {
            handleError(res, e, 'agentListOffers');
        }
    }

    async agentGetOffer(req, res) {
        try {
            const projectId = projectIdOf(req);
            const row = await contentFactoryService.getPublishedOfferForAgent(
                projectId,
                req.params.id,
            );
            if (!row) {
                return res.status(404).json({ error: 'Offer not found' });
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
            const agentId = requireAgentId(req, res);
            if (!agentId) return;
            const result = await contentFactoryService.generatePresentationPdf(
                projectId,
                agentId,
                req.params.id,
            );
            if (req.query.download === '1') {
                const buf = Buffer.from(result.pdf_base64, 'base64');
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Length', String(buf.length));
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
