/**
 * Content Factory — templates, offers, HTML generate, agent presentations.
 */
const axios = require('axios');
const knex = require('../config/database');
const { openrouterAxiosExtras } = require('../utils/openrouterProxy');
const { renderHtmlToPdfBuffer } = require('../utils/renderHtmlToPdfBuffer');
const {
    CTA_ATTR,
    fillPlaceholders,
    ensureCtaSlot,
    injectUtmAgent,
    flattenPayload,
} = require('../utils/contentFactoryHtml');

function parseJsonField(value, fallback = null) {
    if (value == null) return fallback;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function buildVarsFromOffer(offer, template) {
    const payload = parseJsonField(offer.payload, {}) || {};
    const flat = flattenPayload(payload);
    return {
        ...flat,
        title: offer.title || flat.title || '',
        cta_href: offer.cta_url_base || flat.cta_href || '#',
        cta_label: offer.cta_label || flat.cta_label || 'Подробнее',
        kind: offer.kind || 'product',
        template_title: template?.title || '',
    };
}

async function resolveOpenRouter() {
    let key = (process.env.OPENROUTER_API_KEY || process.env.SILICONFLOW_API_KEY || '').trim();
    if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
        key = key.slice(1, -1);
    }
    const isSilicon = !process.env.OPENROUTER_API_KEY && !!process.env.SILICONFLOW_API_KEY;
    const baseUrl = isSilicon
        ? process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1'
        : process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
    const model =
        (process.env.OPENROUTER_MODEL || '').trim() ||
        (isSilicon ? 'deepseek-ai/DeepSeek-V3' : 'google/gemma-3-27b-it');
    return { key, baseUrl, model };
}

async function llmComplete(messages, { maxTokens = 8000 } = {}) {
    const { key, baseUrl, model } = await resolveOpenRouter();
    if (!key) {
        const err = new Error('OPENROUTER_API_KEY is not set');
        err.statusCode = 503;
        throw err;
    }
    const response = await axios.post(
        `${baseUrl}/chat/completions`,
        {
            model,
            messages,
            stream: false,
            max_tokens: maxTokens,
        },
        {
            headers: {
                Authorization: `Bearer ${key}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': process.env.App_URL || 'https://pfp.app',
                'X-Title': 'PFP Content Factory',
            },
            timeout: 120000,
            ...openrouterAxiosExtras(),
        },
    );
    return response.data?.choices?.[0]?.message?.content || '';
}

function stripCodeFences(text) {
    let t = String(text || '').trim();
    if (t.startsWith('```')) {
        t = t.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '');
    }
    return t.trim();
}

function assertCtaPreserved(before, after) {
    if (String(before).includes(CTA_ATTR) && !String(after).includes(CTA_ATTR)) {
        const err = new Error('AI edit removed CTA slot (data-cta-slot). Rejected.');
        err.statusCode = 422;
        throw err;
    }
}

// ── Templates ──────────────────────────────────────────────

async function listTemplates(projectId, { activeOnly = false } = {}) {
    const q = knex('content_templates').where({ project_id: projectId });
    if (activeOnly) q.andWhere({ is_active: true });
    return q.orderBy('id', 'desc');
}

async function getTemplate(projectId, id) {
    return knex('content_templates').where({ project_id: projectId, id }).first();
}

async function createTemplate(projectId, body) {
    const title = String(body.title || '').trim();
    let html_source = String(body.html_source || '').trim();
    if (!title || !html_source) {
        const err = new Error('title and html_source are required');
        err.statusCode = 400;
        throw err;
    }
    html_source = ensureCtaSlot(html_source);
    const [id] = await knex('content_templates').insert({
        project_id: projectId,
        title,
        description: body.description != null ? String(body.description) : null,
        html_source,
        slots: body.slots != null ? JSON.stringify(body.slots) : null,
        is_active: body.is_active !== false,
    });
    return getTemplate(projectId, id);
}

async function updateTemplate(projectId, id, body) {
    const existing = await getTemplate(projectId, id);
    if (!existing) {
        const err = new Error('Template not found');
        err.statusCode = 404;
        throw err;
    }
    const patch = {};
    if (body.title != null) patch.title = String(body.title).trim();
    if (body.description !== undefined) patch.description = body.description;
    if (body.html_source != null) patch.html_source = ensureCtaSlot(String(body.html_source));
    if (body.slots !== undefined) patch.slots = body.slots != null ? JSON.stringify(body.slots) : null;
    if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active);
    patch.updated_at = knex.fn.now();
    await knex('content_templates').where({ id, project_id: projectId }).update(patch);
    return getTemplate(projectId, id);
}

async function deleteTemplate(projectId, id) {
    const n = await knex('content_templates').where({ project_id: projectId, id }).del();
    if (!n) {
        const err = new Error('Template not found');
        err.statusCode = 404;
        throw err;
    }
    return { ok: true };
}

// ── Offers ─────────────────────────────────────────────────

function mapOffer(row) {
    if (!row) return null;
    return {
        ...row,
        payload: parseJsonField(row.payload, {}),
    };
}

async function listOffers(projectId, { status, includeExpired = true } = {}) {
    const q = knex('content_offers').where({ project_id: projectId });
    if (status) q.andWhere({ status });
    if (!includeExpired) {
        q.andWhere((b) => {
            b.whereNull('expires_at').orWhere('expires_at', '>', knex.fn.now());
        });
    }
    const rows = await q.orderBy('id', 'desc');
    return rows.map(mapOffer);
}

/** Published + not expired — agent catalog */
async function listPublishedOffers(projectId) {
    const rows = await knex('content_offers')
        .where({ project_id: projectId, status: 'published' })
        .andWhere((b) => {
            b.whereNull('expires_at').orWhere('expires_at', '>', knex.fn.now());
        })
        .orderBy('published_at', 'desc');
    return rows.map(mapOffer);
}

async function assertPublishedOfferIds(projectId, offerIds) {
    const ids = Array.isArray(offerIds) ? offerIds.map(Number).filter(Boolean) : [];
    if (!ids.length) {
        const err = new Error('offer_ids must be a non-empty array');
        err.statusCode = 400;
        throw err;
    }
    const published = await listPublishedOffers(projectId);
    const allowed = new Set(published.map((o) => Number(o.id)));
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

async function createOffer(projectId, body, userId) {
    const title = String(body.title || '').trim();
    if (!title) {
        const err = new Error('title is required');
        err.statusCode = 400;
        throw err;
    }
    if (body.template_id) {
        const t = await getTemplate(projectId, body.template_id);
        if (!t) {
            const err = new Error('template_id not found in project');
            err.statusCode = 400;
            throw err;
        }
    }
    const [id] = await knex('content_offers').insert({
        project_id: projectId,
        template_id: body.template_id || null,
        title,
        kind: body.kind || 'product',
        payload: body.payload != null ? JSON.stringify(body.payload) : null,
        cta_url_base: body.cta_url_base || null,
        cta_label: body.cta_label || null,
        status: 'draft',
        expires_at: body.expires_at || null,
        created_by_user_id: userId || null,
    });
    return getOffer(projectId, id);
}

async function updateOffer(projectId, id, body) {
    const existing = await getOffer(projectId, id);
    if (!existing) {
        const err = new Error('Offer not found');
        err.statusCode = 404;
        throw err;
    }
    if (body.template_id != null) {
        const t = await getTemplate(projectId, body.template_id);
        if (!t) {
            const err = new Error('template_id not found in project');
            err.statusCode = 400;
            throw err;
        }
    }
    const patch = {};
    for (const key of ['title', 'kind', 'cta_url_base', 'cta_label', 'template_id']) {
        if (body[key] !== undefined) patch[key] = body[key];
    }
    if (body.payload !== undefined) patch.payload = JSON.stringify(body.payload);
    if (body.expires_at !== undefined) patch.expires_at = body.expires_at;
    if (body.generated_html !== undefined) patch.generated_html = body.generated_html;
    patch.updated_at = knex.fn.now();
    await knex('content_offers').where({ id, project_id: projectId }).update(patch);
    return getOffer(projectId, id);
}

async function generateOfferHtml(projectId, id, { useLlm = false } = {}) {
    const offer = await getOffer(projectId, id);
    if (!offer) {
        const err = new Error('Offer not found');
        err.statusCode = 404;
        throw err;
    }
    if (!offer.template_id) {
        const err = new Error('template_id is required to generate HTML');
        err.statusCode = 400;
        throw err;
    }
    const template = await getTemplate(projectId, offer.template_id);
    if (!template) {
        const err = new Error('Template not found');
        err.statusCode = 404;
        throw err;
    }

    const vars = buildVarsFromOffer(offer, template);
    let html = ensureCtaSlot(template.html_source);
    html = fillPlaceholders(html, vars);

    if (useLlm) {
        const polished = await llmComplete([
            {
                role: 'system',
                content:
                    'You polish marketing HTML. Return ONLY full HTML document. ' +
                    `MUST keep attribute ${CTA_ATTR} on the CTA <a> tag. Do not invent new external scripts.`,
            },
            {
                role: 'user',
                content: `Polish this offer page HTML for kind=${offer.kind}. Keep structure.\n\n${html}`,
            },
        ]);
        const next = ensureCtaSlot(stripCodeFences(polished));
        assertCtaPreserved(html, next);
        html = next;
    }

    await knex('content_offers').where({ id, project_id: projectId }).update({
        generated_html: html,
        updated_at: knex.fn.now(),
    });
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
        const err = new Error('Generate HTML before publish');
        err.statusCode = 400;
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

async function archiveOffer(projectId, id) {
    const n = await knex('content_offers').where({ project_id: projectId, id }).update({
        status: 'archived',
        updated_at: knex.fn.now(),
    });
    if (!n) {
        const err = new Error('Offer not found');
        err.statusCode = 404;
        throw err;
    }
    return getOffer(projectId, id);
}

/** Soft-expire: mark published past expires_at as archived (lazy job). */
async function expireOffers(projectId = null) {
    const q = knex('content_offers')
        .where({ status: 'published' })
        .whereNotNull('expires_at')
        .andWhere('expires_at', '<=', knex.fn.now());
    if (projectId) q.andWhere({ project_id: projectId });
    return q.update({ status: 'archived', updated_at: knex.fn.now() });
}

// ── Chat ───────────────────────────────────────────────────

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

async function postChatMessage(projectId, offerId, userContent) {
    const offer = await getOffer(projectId, offerId);
    if (!offer) {
        const err = new Error('Offer not found');
        err.statusCode = 404;
        throw err;
    }
    const html = offer.generated_html || '';
    if (!html) {
        const err = new Error('Generate HTML before AI chat');
        err.statusCode = 400;
        throw err;
    }

    await knex('content_offer_chat_messages').insert({
        offer_id: offerId,
        project_id: projectId,
        role: 'user',
        content: String(userContent),
    });

    const history = await listChatMessages(projectId, offerId);
    const messages = [
        {
            role: 'system',
            content:
                `You edit marketing HTML for a content offer. Reply with ONLY the full updated HTML. ` +
                `CRITICAL: preserve every element with attribute ${CTA_ATTR}. Do not remove the CTA button.`,
        },
    ];
    // Last user instructions (without re-sending full HTML each turn).
    for (const m of history.slice(-7, -1)) {
        if (m.role === 'user' && String(m.content).trim()) {
            messages.push({ role: 'user', content: String(m.content).trim() });
        }
    }
    messages.push({
        role: 'user',
        content: `Current HTML:\n\n${html}\n\n---\nInstruction: ${userContent}`,
    });

    let assistantHtml = stripCodeFences(await llmComplete(messages));
    assistantHtml = ensureCtaSlot(assistantHtml);
    assertCtaPreserved(html, assistantHtml);

    await knex('content_offers').where({ id: offerId, project_id: projectId }).update({
        generated_html: assistantHtml,
        updated_at: knex.fn.now(),
    });

    await knex('content_offer_chat_messages').insert({
        offer_id: offerId,
        project_id: projectId,
        role: 'assistant',
        content: 'HTML updated (full document applied to offer.generated_html).',
    });

    return {
        offer: await getOffer(projectId, offerId),
        messages: await listChatMessages(projectId, offerId),
    };
}

// ── Presentations (agent) ──────────────────────────────────

function mapPresentation(row) {
    if (!row) return null;
    return {
        ...row,
        offer_ids: parseJsonField(row.offer_ids, []) || [],
    };
}

async function listPresentations(projectId, agentId) {
    const rows = await knex('agent_presentations')
        .where({ project_id: projectId, agent_id: agentId })
        .orderBy('id', 'desc');
    return rows.map(mapPresentation);
}

async function getPresentation(projectId, agentId, id) {
    const row = await knex('agent_presentations')
        .where({ project_id: projectId, agent_id: agentId, id })
        .first();
    return mapPresentation(row);
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

function wrapPagesHtml(pages, title) {
    const body = pages
        .map(
            (p, i) =>
                `<section class="cf-page" data-page="${i + 1}" style="page-break-after:always;padding:24px;">${p}</section>`,
        )
        .join('\n');
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${String(title || 'Presentation').replace(/</g, '')}</title>
<style>body{font-family:Segoe UI,Roboto,Arial,sans-serif;margin:0;color:#111} .cf-page{min-height:90vh}</style>
</head><body>${body}</body></html>`;
}

async function buildPresentationHtml(projectId, presentation, utmAgent) {
    const pages = [];
    for (const oid of presentation.offer_ids) {
        const offer = await getOffer(projectId, oid);
        if (!offer?.generated_html) continue;
        let html = offer.generated_html;
        // re-apply base cta then agent utm
        html = fillPlaceholders(html, {
            cta_href: offer.cta_url_base || '#',
            cta_label: offer.cta_label || 'Подробнее',
        });
        html = injectUtmAgent(html, utmAgent);
        // extract body if full document
        const m = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        pages.push(m ? m[1] : html);
    }
    if (!pages.length) {
        const err = new Error('No offer HTML to render');
        err.statusCode = 400;
        throw err;
    }
    return wrapPagesHtml(pages, presentation.title);
}

async function generatePresentationPdf(projectId, agentId, id) {
    const presentation = await getPresentation(projectId, agentId, id);
    if (!presentation) {
        const err = new Error('Presentation not found');
        err.statusCode = 404;
        throw err;
    }
    const utm = await resolveAgentUtm(agentId);
    const html = await buildPresentationHtml(projectId, presentation, utm);
    const pdfBuffer = await renderHtmlToPdfBuffer(html, { preferCssPageSize: true });
    await knex('agent_presentations').where({ id, project_id: projectId, agent_id: agentId }).update({
        pdf_html_snapshot: html,
        status: 'ready',
        updated_at: knex.fn.now(),
    });
    return {
        presentation: await getPresentation(projectId, agentId, id),
        pdf_base64: pdfBuffer.toString('base64'),
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

    let subject = `Материалы: ${presentation.title}`;
    let body = `Здравствуйте!\n\nНаправляю подборку материалов (${titles.join(', ') || presentation.title}).\n\nС уважением,\n${agentName}`;

    try {
        const raw = await llmComplete([
            {
                role: 'system',
                content:
                    'You write short professional Russian email from a financial advisor to a client. ' +
                    'Return JSON only: {"subject":"...","body":"..."} plain text body, no HTML.',
            },
            {
                role: 'user',
                content: `Presentation title: ${presentation.title}\nOffers: ${titles.join('; ')}\nAgent name: ${agentName}`,
            },
        ]);
        const cleaned = stripCodeFences(raw);
        const json = JSON.parse(cleaned);
        if (json.subject) subject = String(json.subject);
        if (json.body) body = String(json.body);
    } catch (e) {
        console.warn('[contentFactory] email draft LLM fallback:', e.message);
    }

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
    CTA_ATTR,
    fillPlaceholders,
    ensureCtaSlot,
    injectUtmAgent,
    flattenPayload,
    // re-export pure helpers for convenience
    listTemplates,
    getTemplate,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    listOffers,
    listPublishedOffers,
    getOffer,
    createOffer,
    updateOffer,
    generateOfferHtml,
    publishOffer,
    unpublishOffer,
    archiveOffer,
    expireOffers,
    listChatMessages,
    postChatMessage,
    listPresentations,
    getPresentation,
    createPresentation,
    updatePresentation,
    generatePresentationPdf,
    draftPresentationEmail,
    sendPresentationEmail,
    resolveAgentUtm,
};
