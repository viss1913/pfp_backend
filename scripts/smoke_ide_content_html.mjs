#!/usr/bin/env node
/**
 * Smoke IDE Content HTML API v1.1 (requires env key — do not commit secrets).
 * Usage: IDE_CONTENT_HTML_BASE_URL=... IDE_CONTENT_FACTORY_SERVICE_KEY=... node scripts/smoke_ide_content_html.mjs
 */
const base = (process.env.IDE_CONTENT_HTML_BASE_URL || '').replace(/\/+$/, '');
const key = (process.env.IDE_CONTENT_FACTORY_SERVICE_KEY || '').trim();

if (!base || !key) {
    console.error('Set IDE_CONTENT_HTML_BASE_URL and IDE_CONTENT_FACTORY_SERVICE_KEY');
    process.exit(1);
}

const headers = {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
};

async function main() {
    const healthRes = await fetch(`${base}/v1/content-html/health`, { headers });
    const health = await healthRes.json();
    console.log('health', healthRes.status, health);
    if (!healthRes.ok) process.exit(1);

    const templatesRes = await fetch(`${base}/v1/content-html/templates`, { headers });
    const templates = await templatesRes.json();
    console.log('templates', templatesRes.status, {
        count: templates.templates?.length,
        ids: templates.templates?.map((t) => t.id),
    });
    if (!templatesRes.ok || !templates.templates?.length) process.exit(1);

    const sessionRes = await fetch(`${base}/v1/content-html/sessions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            title: 'pfp-smoke',
            generate: false,
            constraints: {
                base_template_id: 'finam-a4-portrait-light',
                page_count: 1,
                preserve_template_chrome: true,
                preserve_attributes: ['data-cta-slot'],
                language: 'ru',
            },
        }),
    });
    const session = await sessionRes.json();
    console.log('session', sessionRes.status, {
        session_id: session.session_id,
        has_html: Boolean(session.html),
        cta: session.html?.includes('data-cta-slot'),
        finam_footer: session.html?.includes('Финам'),
    });
    if (!sessionRes.ok || !session.html?.includes('data-cta-slot')) process.exit(1);
    console.log('OK');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
