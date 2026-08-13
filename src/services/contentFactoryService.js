/**
 * Content Factory BFF — offers, IDE chat, agent presentations.
 */
const knex = require('../config/database');
const ideClient = require('./ideContentHtmlClient');
const { renderContentHtmlToPdfBuffer } = require('../utils/contentFactoryPrintSafe');
const {
    CTA_ATTR,
    applyCtaToOfferHtml,
    buildPdfHtml,
    hasCtaSlot,
    wrapOfferHtmlDocuments,
} = require('../utils/contentFactoryHtml');
const {
    buildIdeConstraints,
    getTemplateMeta,
    listTemplatesForAdmin,
    loadTemplateHtml,
    normalizePageCount,
    resolveTemplateId,
} = require('../utils/contentFactoryTemplates');

const ADMIN_TEMPLATE_PREVIEW_PREFIX = '/api/admin/content-factory/templates';

function mapIdeTemplateForAdmin(row) {
    const id = row?.id;
    if (!id) return null;
    return {
        id,
        title: row.title || id,
        orientation: row.orientation,
        theme: row.theme,
        format: row.format || 'a4',
        page_size: row.page_size,
        brand: row.brand,
        preview_url: `${ADMIN_TEMPLATE_PREVIEW_PREFIX}/${id}/preview`,
    };
}

function mapIdeError(error) {
    if (error?.code === 'unknown_template') {
        const err = new Error(error.message || 'Unknown template');
        err.statusCode = 400;
        err.code = 'unknown_template';
        err.details = error.details;
        throw err;
    }
    throw error;
}

function mapOffer(row) {
    if (!row) return null;
    return { ...row };
}

function mapAgentOfferListItem(row) {
    if (!row) return null;
    return {
        id: row.id,
        title: row.title,
        kind: row.kind,
        brief: row.brief,
        cta_label: row.cta_label,
        published_at: row.published_at,
        expires_at: row.expires_at,
        base_template_id: row.base_template_id,
        page_count: row.page_count,
    };
}

function mapAgentOfferDetail(row) {
    if (!row) return null;
    return {
        ...mapAgentOfferListItem(row),
        cta_url_base: row.cta_url_base,
        preview_html: row.generated_html
            ? applyCtaToOfferHtml(row.generated_html, row)
            : null,
    };
}

function sortOffersByIds(offerIds, rows) {
    const byId = new Map(rows.map((row) => [Number(row.id), row]));
    return (offerIds || [])
        .map((id) => byId.get(Number(id)))
        .filter(Boolean);
}

function mapAgentOfferDeckItem(row) {
    if (!row) return null;
    return {
        ...mapAgentOfferListItem(row),
        preview_html: row.generated_html
            ? applyCtaToOfferHtml(row.generated_html, row)
            : null,
    };
}

function mapPresentation(row) {
    if (!row) return null;
    let offerIds = row.offer_ids;
    if (typeof offerIds === 'string') {
        try {
            offerIds = JSON.parse(offerIds);
        } catch {
            offerIds = [];
        }
    }
    return { ...row, offer_ids: offerIds || [] };
}

async function ideHealth() {
    return ideClient.health();
}

async function listOffers(projectId, { status, includeExpired = true } = {}) {
    const q = knex('content_offers').where({ project_id: projectId });
    if (status) q.andWhere({ status });
    if (!includeExpired) {
        q.andWhere(function () {
            this.whereNull('expires_at').orWhere('expires_at', '>', knex.fn.now());
        });
    }
    return q.orderBy('id', 'desc').then((rows) => rows.map(mapOffer));
}

async function listPublishedOffers(projectId) {
    return knex('content_offers')
        .where({ project_id: projectId, status: 'published' })
        .andWhere(function () {
            this.whereNull('expires_at').orWhere('expires_at', '>', knex.fn.now());
        })
        .orderBy('published_at', 'desc')
        .then((rows) => rows.map(mapOffer));
}

async function listPublishedOffersForAgent(projectId) {
    return knex('content_offers')
        .where({ project_id: projectId, status: 'published' })
        .andWhere(function () {
            this.whereNull('expires_at').orWhere('expires_at', '>', knex.fn.now());
        })
        .orderBy('published_at', 'desc')
        .then((rows) => rows.map(mapAgentOfferListItem));
}

async function getPublishedOfferForAgent(projectId, id) {
    const row = await knex('content_offers')
        .where({ project_id: projectId, id, status: 'published' })
        .first();
    if (!row) return null;
    if (row.expires_at && new Date(row.expires_at) <= new Date()) return null;
    return mapAgentOfferDetail(row);
}

async function assertPublishedOfferIds(projectId, offerIdsRaw) {
    const ids = Array.isArray(offerIdsRaw) ? offerIdsRaw.map(Number).filter(Boolean) : [];
    if (!ids.length) {
        const err = new Error('offer_ids must be a non-empty array');
        err.statusCode = 400;
        throw err;
    }
    const rows = await knex('content_offers')
        .where({ project_id: projectId, status: 'published' })
        .whereIn('id', ids)
        .andWhere(function () {
            this.whereNull('expires_at').orWhere('expires_at', '>', knex.fn.now());
        });
    const allowed = new Set(rows.map((r) => r.id));
    for (const oid of ids) {
        if (!allowed.has(Number(oid))) {
            const err = new Error(`Offer ${oid} is not available (published & not expired)`);
            err.statusCode = 400;
            throw err;
        }
    }
    return ids;
}

async function getOffer(projectId, id) {
    const row = await knex('content_offers').where({ project_id: projectId, id }).first();
    return mapOffer(row);
}

function buildIdeSessionBody(offer, { generate } = {}) {
    const baseTemplateId = resolveTemplateId(offer.base_template_id);
    const pageCount = normalizePageCount(offer.page_count);
    return {
        title: offer.title,
        brief: offer.brief || null,
        external_ref: `pfp-offer-${offer.id}`,
        generate: generate !== false,
        constraints: buildIdeConstraints(baseTemplateId, pageCount),
    };
}

async function listTemplates() {
    try {
        const data = await ideClient.listTemplates();
        const templates = (data?.templates || [])
            .map(mapIdeTemplateForAdmin)
            .filter(Boolean);
        if (templates.length) return { templates, source: 'ide' };
    } catch (e) {
        console.warn('[ContentFactory] IDE templates list failed, using local fallback:', e.message);
    }
    return { templates: listTemplatesForAdmin(), source: 'local' };
}

async function getTemplatePreview(templateId) {
    const tid = resolveTemplateId(templateId);
    try {
        const data = await ideClient.getTemplateHtml(tid);
        if (data?.html) {
            return {
                meta: mapIdeTemplateForAdmin(data) || { id: tid, title: tid },
                html: data.html,
                source: 'ide',
            };
        }
    } catch (e) {
        if (e.statusCode === 404 || e.code === 'unknown_template') throw e;
        console.warn('[ContentFactory] IDE template preview failed, using local fallback:', e.message);
    }
    const meta = getTemplateMeta(tid);
    const html = loadTemplateHtml(meta.id);
    return { meta, html, source: 'local' };
}

async function ensureIdeSession(projectId, offer) {
    if (offer.ide_session_id) return offer;
    const session = await ideClient.createSession(buildIdeSessionBody(offer, { generate: false }));
    await knex('content_offers').where({ id: offer.id, project_id: projectId }).update({
        ide_session_id: session.session_id,
        generated_html: session.html || offer.generated_html,
        updated_at: knex.fn.now(),
    });
    return getOffer(projectId, offer.id);
}

async function createOffer(projectId, body, userId) {
    const title = String(body.title || '').trim();
    if (!title) {
        const err = new Error('title is required');
        err.statusCode = 400;
        throw err;
    }
    const brief = body.brief != null ? String(body.brief).trim() : null;
    const generate = body.generate !== false && !!brief;
    const baseTemplateId = resolveTemplateId(body.base_template_id);
    const pageCount = normalizePageCount(body.page_count);

    const [id] = await knex('content_offers').insert({
        project_id: projectId,
        title,
        kind: body.kind || 'product',
        brief: brief || null,
        base_template_id: baseTemplateId,
        page_count: pageCount,
        cta_url_base: body.cta_url_base || null,
        cta_label: body.cta_label || null,
        status: 'draft',
        expires_at: body.expires_at || null,
        created_by_user_id: userId || null,
    });

    let session;
    try {
        session = await ideClient.createSession(
            buildIdeSessionBody(
                {
                    id,
                    title,
                    brief: brief || null,
                    base_template_id: baseTemplateId,
                    page_count: pageCount,
                },
                { generate },
            ),
        );
    } catch (e) {
        console.error('[ContentFactory] IDE session create failed for offer', id, e.message);
        if (e.code === 'unknown_template') {
            await knex('content_offers').where({ id, project_id: projectId }).delete();
            mapIdeError(e);
        }
        return getOffer(projectId, id);
    }

    await knex('content_offers').where({ id, project_id: projectId }).update({
        ide_session_id: session.session_id,
        generated_html: session.html || null,
        updated_at: knex.fn.now(),
    });

    if (session.assistant_message && brief) {
        await knex('content_offer_chat_messages').insert({
            offer_id: id,
            project_id: projectId,
            role: 'assistant',
            content: String(session.assistant_message),
        });
    }

    return getOffer(projectId, id);
}

async function updateOffer(projectId, id, body) {
    const existing = await getOffer(projectId, id);
    if (!existing) {
        const err = new Error('Offer not found');
        err.statusCode = 404;
        throw err;
    }
    const patch = {};
    for (const key of ['title', 'kind', 'brief', 'cta_url_base', 'cta_label']) {
        if (body[key] !== undefined) patch[key] = body[key];
    }
    if (body.base_template_id !== undefined) {
        if (existing.ide_session_id) {
            const err = new Error('base_template_id cannot be changed after IDE session is created');
            err.statusCode = 400;
            throw err;
        }
        patch.base_template_id = resolveTemplateId(body.base_template_id);
    }
    if (body.page_count !== undefined) {
        if (existing.ide_session_id) {
            const err = new Error('page_count cannot be changed after IDE session is created');
            err.statusCode = 400;
            throw err;
        }
        patch.page_count = normalizePageCount(body.page_count);
    }
    if (body.expires_at !== undefined) patch.expires_at = body.expires_at;
    patch.updated_at = knex.fn.now();
    await knex('content_offers').where({ id, project_id: projectId }).update(patch);
    return getOffer(projectId, id);
}

async function publishOffer(projectId, id) {
    const offer = await getOffer(projectId, id);
    if (!offer) {
        const err = new Error('Offer not found');
        err.statusCode = 404;
        throw err;
    }
    if (!offer.generated_html) {
        const err = new Error('HTML is required before publish');
        err.statusCode = 400;
        throw err;
    }
    if (!hasCtaSlot(offer.generated_html)) {
        const err = new Error(`CTA slot (${CTA_ATTR}) is missing from HTML`);
        err.statusCode = 422;
        throw err;
    }
    await knex('content_offers').where({ id, project_id: projectId }).update({
        status: 'published',
        published_at: knex.fn.now(),
        updated_at: knex.fn.now(),
    });
    return getOffer(projectId, id);
}

async function unpublishOffer(projectId, id) {
    const offer = await getOffer(projectId, id);
    if (!offer) {
        const err = new Error('Offer not found');
        err.statusCode = 404;
        throw err;
    }
    await knex('content_offers').where({ id, project_id: projectId }).update({
        status: 'draft',
        updated_at: knex.fn.now(),
    });
    return getOffer(projectId, id);
}

async function detachOfferFromPresentations(projectId, offerId) {
    const presentations = await knex('agent_presentations')
        .where({ project_id: projectId })
        .select('id', 'offer_ids');
    const oid = Number(offerId);
    for (const p of presentations) {
        let ids = p.offer_ids;
        if (typeof ids === 'string') {
            try {
                ids = JSON.parse(ids);
            } catch {
                ids = [];
            }
        }
        if (!Array.isArray(ids) || !ids.some((x) => Number(x) === oid)) continue;
        const next = ids.filter((x) => Number(x) !== oid);
        if (!next.length) {
            await knex('agent_presentations').where({ id: p.id, project_id: projectId }).delete();
        } else {
            await knex('agent_presentations').where({ id: p.id, project_id: projectId }).update({
                offer_ids: JSON.stringify(next),
                updated_at: knex.fn.now(),
            });
        }
    }
}

async function deleteOffer(projectId, id) {
    const offer = await getOffer(projectId, id);
    if (!offer) {
        const err = new Error('Offer not found');
        err.statusCode = 404;
        throw err;
    }

    await detachOfferFromPresentations(projectId, id);
    await knex('content_offers').where({ id, project_id: projectId }).delete();

    if (offer.ide_session_id) {
        try {
            await ideClient.deleteSession(offer.ide_session_id);
        } catch (e) {
            console.warn('[ContentFactory] IDE session delete failed:', truncateLogMessage(e.message));
        }
    }

    return { id: Number(id), deleted: true };
}

/** DELETE /offers/:id — hard delete (legacy name kept for routes). */
async function archiveOffer(projectId, id) {
    return deleteOffer(projectId, id);
}

async function expireOffers(projectId = null) {
    const q = knex('content_offers')
        .where({ status: 'published' })
        .whereNotNull('expires_at')
        .andWhere('expires_at', '<=', knex.fn.now());
    if (projectId) q.andWhere({ project_id: projectId });
    const rows = await q.select('id', 'project_id');
    let count = 0;
    for (const row of rows) {
        await deleteOffer(row.project_id, row.id);
        count += 1;
    }
    return count;
}

function truncateLogMessage(message, maxLen = 240) {
    const text = String(message || '');
    return text.length <= maxLen ? text : `${text.slice(0, maxLen)}…`;
}

async function syncOfferFromIde(projectId, id) {
    const offer = await getOffer(projectId, id);
    if (!offer?.ide_session_id) return offer;
    try {
        const session = await ideClient.getSession(offer.ide_session_id);
        if (!session?.html) return offer;
        try {
            await knex('content_offers').where({ id, project_id: projectId }).update({
                generated_html: session.html,
                updated_at: knex.fn.now(),
            });
        } catch (dbErr) {
            console.warn(
                '[ContentFactory] syncFromIde DB save failed:',
                truncateLogMessage(dbErr.message),
                dbErr.code || dbErr.errno || '',
            );
            // Still use fresh IDE HTML for PDF render even if DB column is too small.
            return { ...offer, generated_html: session.html };
        }
        return getOffer(projectId, id);
    } catch (e) {
        console.warn('[ContentFactory] syncFromIde failed:', truncateLogMessage(e.message));
    }
    return offer;
}

function needsIdeHtmlSync(html) {
    const h = String(html || '');
    if (!h) return true;
    return h.includes('__CF_DATA_URI') || /\bassets\//.test(h);
}

async function ensureOfferHtmlFreshForRender(projectId, offer) {
    if (!offer?.ide_session_id) return offer;
    if (!needsIdeHtmlSync(offer.generated_html)) return offer;
    return syncOfferFromIde(projectId, offer.id);
}

async function listChatMessages(projectId, offerId) {
    const offer = await getOffer(projectId, offerId);
    if (!offer) {
        const err = new Error('Offer not found');
        err.statusCode = 404;
        throw err;
    }
    return knex('content_offer_chat_messages')
        .where({ offer_id: offerId, project_id: projectId })
        .orderBy('id', 'asc')
        .limit(200);
}

async function persistTurnResult(projectId, offerId, turnResult) {
    const offer = await getOffer(projectId, offerId);
    const html = turnResult.html;
    if (!html || !hasCtaSlot(html)) {
        const err = new Error(`IDE turn removed CTA slot (${CTA_ATTR})`);
        err.statusCode = 422;
        err.code = 'cta_slot_removed';
        throw err;
    }
    const previewHtml = applyCtaToOfferHtml(html, offer);
    await knex('content_offers').where({ id: offerId, project_id: projectId }).update({
        generated_html: html,
        updated_at: knex.fn.now(),
    });
    const assistantText =
        turnResult.assistant_message ||
        'HTML обновлён (полный документ сохранён в offer.generated_html).';
    await knex('content_offer_chat_messages').insert({
        offer_id: offerId,
        project_id: projectId,
        role: 'assistant',
        content: String(assistantText),
    });
    return {
        offer: await getOffer(projectId, offerId),
        preview_html: previewHtml,
        assistant_message: assistantText,
        validation: turnResult.validation,
    };
}

async function postChatMessage(projectId, offerId, userContent, options = {}) {
    let offer = await getOffer(projectId, offerId);
    if (!offer) {
        const err = new Error('Offer not found');
        err.statusCode = 404;
        throw err;
    }
    offer = await ensureIdeSession(projectId, offer);

    await knex('content_offer_chat_messages').insert({
        offer_id: offerId,
        project_id: projectId,
        role: 'user',
        content: String(userContent),
    });

    const turnResult = await ideClient.postMessage(
        offer.ide_session_id,
        {
            content: String(userContent),
            current_html: offer.generated_html || null,
            attachments: options.attachments,
            files: options.files,
        },
        { stream: options.stream, res: options.res },
    );

    const result = await persistTurnResult(projectId, offerId, turnResult);
    if (!options.stream) {
        result.messages = await listChatMessages(projectId, offerId);
    }
    return result;
}

async function uploadOfferMedia(projectId, offerId, files) {
    let offer = await getOffer(projectId, offerId);
    if (!offer) {
        const err = new Error('Offer not found');
        err.statusCode = 404;
        throw err;
    }
    offer = await ensureIdeSession(projectId, offer);
    return ideClient.uploadMedia(offer.ide_session_id, files);
}

async function listOfferMedia(projectId, offerId) {
    let offer = await getOffer(projectId, offerId);
    if (!offer) {
        const err = new Error('Offer not found');
        err.statusCode = 404;
        throw err;
    }
    offer = await ensureIdeSession(projectId, offer);
    return ideClient.listMedia(offer.ide_session_id);
}

async function loadOrderedAgentOffers(projectId, offerIds) {
    const ids = Array.isArray(offerIds) ? offerIds.map(Number).filter(Boolean) : [];
    if (!ids.length) return [];
    const rows = await knex('content_offers')
        .where({ project_id: projectId, status: 'published' })
        .whereIn('id', ids)
        .andWhere(function () {
            this.whereNull('expires_at').orWhere('expires_at', '>', knex.fn.now());
        });
    return sortOffersByIds(ids, rows).map(mapAgentOfferDeckItem);
}

async function enrichPresentation(projectId, presentation) {
    if (!presentation) return null;
    const offers = await loadOrderedAgentOffers(projectId, presentation.offer_ids);
    return { ...presentation, offers };
}

async function listPresentations(projectId, agentId) {
    const rows = await knex('agent_presentations')
        .where({ project_id: projectId, agent_id: agentId })
        .orderBy('id', 'desc');
    const presentations = rows.map(mapPresentation);
    return Promise.all(presentations.map((row) => enrichPresentation(projectId, row)));
}

async function getPresentation(projectId, agentId, id) {
    const row = await knex('agent_presentations')
        .where({ project_id: projectId, agent_id: agentId, id })
        .first();
    return enrichPresentation(projectId, mapPresentation(row));
}

async function createPresentation(projectId, agentId, body) {
    const title = String(body.title || 'Презентация').trim();
    const offerIds = await assertPublishedOfferIds(projectId, body.offer_ids);
    const [id] = await knex('agent_presentations').insert({
        project_id: projectId,
        agent_id: agentId,
        title,
        offer_ids: JSON.stringify(offerIds),
        status: 'draft',
        recipient_client_id: body.recipient_client_id || null,
    });
    return getPresentation(projectId, agentId, id);
}

async function updatePresentation(projectId, agentId, id, body) {
    const existing = await getPresentation(projectId, agentId, id);
    if (!existing) {
        const err = new Error('Presentation not found');
        err.statusCode = 404;
        throw err;
    }
    const patch = {};
    if (body.title != null) patch.title = String(body.title).trim();
    if (body.offer_ids != null) {
        const offerIds = await assertPublishedOfferIds(projectId, body.offer_ids);
        patch.offer_ids = JSON.stringify(offerIds);
    }
    if (body.recipient_client_id !== undefined) patch.recipient_client_id = body.recipient_client_id;
    if (body.email_subject !== undefined) patch.email_subject = body.email_subject;
    if (body.email_body !== undefined) patch.email_body = body.email_body;
    patch.updated_at = knex.fn.now();
    await knex('agent_presentations').where({ id, project_id: projectId, agent_id: agentId }).update(patch);
    return getPresentation(projectId, agentId, id);
}

async function resolveAgentUtm(agentId) {
    const agent = await knex('agents').where({ id: agentId }).first();
    if (!agent) return String(agentId);
    const partner = agent.partner_agent_id != null ? String(agent.partner_agent_id).trim() : '';
    return partner || String(agentId);
}

/**
 * Full HTML docs per offer (CTA/utm applied). Kept separate so light+dark
 * themes do not fight in one CSS cascade when building a multi-offer PDF.
 */
async function collectPresentationOfferHtmlDocs(projectId, presentation, utmAgent) {
    const docs = [];
    for (const oid of presentation.offer_ids) {
        let offer = await getOffer(projectId, oid);
        if (offer?.ide_session_id) {
            offer = await ensureOfferHtmlFreshForRender(projectId, offer);
        }
        if (!offer?.generated_html) continue;
        docs.push(buildPdfHtml(offer.generated_html, offer, utmAgent));
    }
    if (!docs.length) {
        const err = new Error('No offer HTML to render');
        err.statusCode = 400;
        throw err;
    }
    return docs;
}

/** @deprecated prefer per-offer PDF render; kept for debug / single-doc tools */
async function buildPresentationHtml(projectId, presentation, utmAgent) {
    const docs = await collectPresentationOfferHtmlDocs(projectId, presentation, utmAgent);
    return wrapOfferHtmlDocuments(docs, presentation.title);
}

function assertValidPdfBuffer(pdfBuffer) {
    const buf = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer || []);
    if (!buf.length) {
        const err = new Error('PDF generation returned empty buffer');
        err.statusCode = 500;
        err.code = 'PDF_EMPTY';
        throw err;
    }
    if (buf.subarray(0, 4).toString('ascii') !== '%PDF') {
        const err = new Error('PDF generation returned invalid data (expected %PDF header)');
        err.statusCode = 500;
        err.code = 'PDF_INVALID';
        throw err;
    }
    return buf;
}

async function mergePdfBuffers(buffers) {
    const list = (buffers || []).filter((b) => b && b.length);
    if (!list.length) {
        const err = new Error('No PDF parts to merge');
        err.statusCode = 500;
        err.code = 'PDF_EMPTY';
        throw err;
    }
    if (list.length === 1) return Buffer.isBuffer(list[0]) ? list[0] : Buffer.from(list[0]);

    const { PDFDocument } = require('pdf-lib');
    const merged = await PDFDocument.create();
    for (const part of list) {
        const src = await PDFDocument.load(part);
        const pages = await merged.copyPages(src, src.getPageIndices());
        for (const page of pages) merged.addPage(page);
    }
    return Buffer.from(await merged.save());
}

async function generatePresentationPdf(projectId, agentId, id) {
    const presentation = await getPresentation(projectId, agentId, id);
    if (!presentation) {
        const err = new Error('Presentation not found');
        err.statusCode = 404;
        throw err;
    }
    const utm = await resolveAgentUtm(agentId);
    const docs = await collectPresentationOfferHtmlDocs(projectId, presentation, utm);
    // Render each offer alone — merging <style> from light+dark into one HTML
    // made Автоследование inherit SpaceX body { background:#0f1419 } and broke layout.
    const parts = [];
    for (const html of docs) {
        parts.push(
            await renderContentHtmlToPdfBuffer(html, {
                title: presentation.title,
            }),
        );
    }
    const pdfBuffer = assertValidPdfBuffer(await mergePdfBuffers(parts));
    const snapshot =
        docs.length === 1
            ? docs[0]
            : docs
                  .map((d, i) => `<!-- cf-offer ${i + 1}/${docs.length} (isolated render) -->\n${d}`)
                  .join('\n');
    await knex('agent_presentations').where({ id, project_id: projectId, agent_id: agentId }).update({
        pdf_html_snapshot: snapshot,
        status: 'ready',
        updated_at: knex.fn.now(),
    });
    return {
        presentation: await getPresentation(projectId, agentId, id),
        pdf_base64: pdfBuffer.toString('base64'),
        pdf_size_bytes: pdfBuffer.length,
        utm_agent: utm,
        content_type: 'application/pdf',
    };
}

async function draftPresentationEmail(projectId, agentId, id) {
    const presentation = await getPresentation(projectId, agentId, id);
    if (!presentation) {
        const err = new Error('Presentation not found');
        err.statusCode = 404;
        throw err;
    }
    const titles = [];
    for (const oid of presentation.offer_ids) {
        const o = await getOffer(projectId, oid);
        if (o) titles.push(o.title);
    }
    const agent = await knex('agents').where({ id: agentId }).first();
    const agentName = [agent?.first_name, agent?.last_name].filter(Boolean).join(' ') || agent?.email || 'Консультант';

    const subject = `Материалы: ${presentation.title}`;
    const body = `Здравствуйте!\n\nНаправляю подборку материалов (${titles.join(', ') || presentation.title}).\n\nС уважением,\n${agentName}`;

    await knex('agent_presentations').where({ id, project_id: projectId, agent_id: agentId }).update({
        email_subject: subject,
        email_body: body,
        updated_at: knex.fn.now(),
    });
    return getPresentation(projectId, agentId, id);
}

async function sendPresentationEmail(projectId, agentId, id, { to } = {}) {
    const presentation = await getPresentation(projectId, agentId, id);
    if (!presentation) {
        const err = new Error('Presentation not found');
        err.statusCode = 404;
        throw err;
    }

    let recipient = to;
    if (!recipient && presentation.recipient_client_id) {
        const client = await knex('clients')
            .where({ id: presentation.recipient_client_id, project_id: projectId })
            .first();
        recipient = client?.email;
    }
    if (!recipient) {
        const err = new Error('Recipient email required (body.to or presentation.recipient_client_id with email)');
        err.statusCode = 400;
        throw err;
    }

    const pdfResult = await generatePresentationPdf(projectId, agentId, id);
    const subject = presentation.email_subject || `Материалы: ${presentation.title}`;
    const textBody = presentation.email_body || 'Направляю материалы во вложении.';
    const html = `<!DOCTYPE html><html><body style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.5;color:#333;">
${String(textBody)
    .split('\n')
    .map((l) => `<p style="margin:0 0 0.6em;">${l.replace(/</g, '&lt;')}</p>`)
    .join('\n')}
</body></html>`;

    const emailService = require('./emailService');
    const sendResult = await emailService.sendContentFactoryPdfEmail({
        to: recipient,
        subject,
        html,
        pdfBase64: pdfResult.pdf_base64,
        filename: `presentation-${id}.pdf`,
    });

    await knex('agent_presentations').where({ id, project_id: projectId, agent_id: agentId }).update({
        status: 'sent',
        updated_at: knex.fn.now(),
    });

    return {
        presentation: await getPresentation(projectId, agentId, id),
        email: sendResult,
        to: recipient,
    };
}

module.exports = {
    ideHealth,
    listTemplates,
    getTemplatePreview,
    listOffers,
    listPublishedOffers,
    listPublishedOffersForAgent,
    getPublishedOfferForAgent,
    getOffer,
    mapAgentOfferListItem,
    mapAgentOfferDetail,
    mapAgentOfferDeckItem,
    sortOffersByIds,
    loadOrderedAgentOffers,
    enrichPresentation,
    createOffer,
    updateOffer,
    publishOffer,
    unpublishOffer,
    archiveOffer,
    deleteOffer,
    expireOffers,
    syncOfferFromIde,
    ensureOfferHtmlFreshForRender,
    needsIdeHtmlSync,
    listChatMessages,
    postChatMessage,
    uploadOfferMedia,
    listOfferMedia,
    listPresentations,
    getPresentation,
    createPresentation,
    updatePresentation,
    generatePresentationPdf,
    draftPresentationEmail,
    sendPresentationEmail,
    resolveAgentUtm,
    assertValidPdfBuffer,
    mergePdfBuffers,
    collectPresentationOfferHtmlDocs,
};
