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

/**
 * Inject utm_agent into every <a data-cta-slot … href="…">
 * Works regardless of attribute order.
 */
function injectUtmAgent(html, utmAgent) {
    const utm = String(utmAgent || '').trim();
    if (!utm) return String(html || '');

    return String(html || '').replace(/<a\b[^>]*\bdata-cta-slot\b[^>]*>/gi, (tag) => {
        if (!/\bhref\s*=/i.test(tag)) {
            // insert href if missing
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

module.exports = {
    CTA_ATTR,
    DEFAULT_CTA_SNIPPET,
    fillPlaceholders,
    ensureCtaSlot,
    injectUtmAgent,
    appendUtmToHref,
    flattenPayload,
};
