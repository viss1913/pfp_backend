/**
 * Pure HTML helpers for Content Factory (no DB / knex).
 */

const CTA_ATTR = 'data-cta-slot';
const DEFAULT_CTA_SNIPPET = `<a ${CTA_ATTR} href="{{cta_href}}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">{{cta_label}}</a>`;

function fillPlaceholders(html, vars) {
    let out = String(html || '');
    for (const [key, val] of Object.entries(vars || {})) {
        const re = new RegExp(
            `\\{\\{\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\}\\}`,
            'g',
        );
        out = out.replace(re, val == null ? '' : String(val));
    }
    out = out.replace(/\{\{\s*[\w.]+\s*\}\}/g, '');
    return out;
}

function ensureCtaSlot(html) {
    const src = String(html || '');
    if (src.includes(CTA_ATTR)) return src;
    if (/<\/body>/i.test(src)) {
        return src.replace(/<\/body>/i, `<div class="cta-wrap">${DEFAULT_CTA_SNIPPET}</div>\n</body>`);
    }
    return `${src}\n<div class="cta-wrap">${DEFAULT_CTA_SNIPPET}</div>`;
}

function appendUtmToHref(href, utm) {
    const base = href || '#';
    const hashIdx = base.indexOf('#');
    let url = hashIdx >= 0 ? base.slice(0, hashIdx) : base;
    const hash = hashIdx >= 0 ? base.slice(hashIdx) : '';
    const sep = url.includes('?') ? '&' : '?';
    if (/[?&]utm_agent=/.test(url)) {
        url = url.replace(/([?&]utm_agent=)[^&]*/i, `$1${encodeURIComponent(utm)}`);
    } else {
        url = `${url}${sep}utm_agent=${encodeURIComponent(utm)}`;
    }
    return `${url}${hash}`;
}

function injectUtmAgent(html, utmAgent) {
    const utm = String(utmAgent || '').trim();
    if (!utm) return String(html || '');

    return String(html || '').replace(/<a\b[^>]*\bdata-cta-slot\b[^>]*>/gi, (tag) => {
        if (!/\bhref\s*=/i.test(tag)) {
            return tag.replace(/>$/, ` href="?utm_agent=${encodeURIComponent(utm)}">`);
        }
        return tag.replace(/\bhref\s*=\s*(["'])([^"']*)\1/i, (_m, quote, href) => {
            const next = appendUtmToHref(href, utm);
            return `href=${quote}${next}${quote}`;
        });
    });
}

function flattenPayload(payload) {
    const flat = {};
    const obj = payload && typeof payload === 'object' ? payload : {};
    for (const [k, v] of Object.entries(obj)) {
        if (v == null) {
            flat[k] = '';
        } else if (typeof v === 'object') {
            flat[k] = JSON.stringify(v);
            flat[`${k}_json`] = flat[k];
        } else {
            flat[k] = String(v);
        }
    }
    return flat;
}

function hasCtaSlot(html) {
    return String(html || '').includes(CTA_ATTR);
}

function applyCtaToOfferHtml(html, offer) {
    const href = offer?.cta_url_base || '#';
    const label = offer?.cta_label || 'Подробнее';
    let out = fillPlaceholders(String(html || ''), { cta_href: href, cta_label: label });
    out = out.replace(/<a\b([^>]*\bdata-cta-slot\b[^>]*)>/gi, (openTag) => {
        let tag = openTag;
        if (/\bhref\s*=/i.test(tag)) {
            tag = tag.replace(/\bhref\s*=\s*(["'])[^"']*\1/i, `href="${href.replace(/"/g, '&quot;')}"`);
        } else {
            tag = tag.replace(/>$/, ` href="${href.replace(/"/g, '&quot;')}">`);
        }
        return tag;
    });
    out = out.replace(
        /(<a\b[^>]*\bdata-cta-slot\b[^>]*>)([\s\S]*?)(<\/a>)/gi,
        (_m, open, _inner, close) => `${open}${label}${close}`,
    );
    return out;
}

function buildPdfHtml(html, offer, utmAgent) {
    return injectUtmAgent(applyCtaToOfferHtml(html, offer), utmAgent);
}

/** Collect `<style>` blocks from a full HTML document (head or body). */
function extractStyleBlocks(html) {
    const styles = [];
    String(html || '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (block) => {
        styles.push(block);
        return '';
    });
    return styles;
}

/** Inner HTML of `<body>`, or the whole string if no body tag. */
function extractBodyInner(html) {
    const m = String(html || '').match(/<body[^>]*>([\s\S]*)<\/body>/i);
    return m ? m[1] : String(html || '');
}

/**
 * Merge one or more offer HTML documents into a print-ready presentation.
 * Preserves offer CSS (previous bug: only body was kept → Finam layout died).
 * @param {string[]} offerHtmlDocs full documents after CTA/utm
 * @param {string} [title]
 */
function wrapOfferHtmlDocuments(offerHtmlDocs, title) {
    const docs = (offerHtmlDocs || []).map((h) => String(h || '')).filter((h) => h.trim());
    if (!docs.length) return '';
    if (docs.length === 1) return docs[0];

    const styleBlocks = [];
    const seen = new Set();
    const sections = docs.map((doc, i) => {
        for (const block of extractStyleBlocks(doc)) {
            if (seen.has(block)) continue;
            seen.add(block);
            styleBlocks.push(block);
        }
        const inner = extractBodyInner(doc);
        return `<section class="cf-offer" data-offer-page="${i + 1}">${inner}</section>`;
    });

    const safeTitle = String(title || 'Presentation').replace(/</g, '');
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${safeTitle}</title>
${styleBlocks.join('\n')}
<style data-cf-wrap="1">
html, body { margin: 0; padding: 0; }
.cf-offer { margin: 0; padding: 0; }
.cf-offer + .cf-offer { page-break-before: always; break-before: page; }
</style>
</head><body>${sections.join('\n')}</body></html>`;
}

module.exports = {
    CTA_ATTR,
    DEFAULT_CTA_SNIPPET,
    fillPlaceholders,
    ensureCtaSlot,
    injectUtmAgent,
    appendUtmToHref,
    flattenPayload,
    hasCtaSlot,
    applyCtaToOfferHtml,
    buildPdfHtml,
    extractStyleBlocks,
    extractBodyInner,
    wrapOfferHtmlDocuments,
};
