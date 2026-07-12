/**
 * Unit tests for Content Factory pure HTML helpers (no DB).
 */
const {
    fillPlaceholders,
    ensureCtaSlot,
    injectUtmAgent,
    CTA_ATTR,
} = require('../src/utils/contentFactoryHtml');

describe('contentFactoryHtml helpers', () => {
    test('fillPlaceholders replaces known keys', () => {
        const html = '<h1>{{title}}</h1><p>{{body}}</p>';
        const out = fillPlaceholders(html, { title: 'Hello', body: 'World' });
        expect(out).toBe('<h1>Hello</h1><p>World</p>');
    });

    test('ensureCtaSlot appends data-cta-slot if missing', () => {
        const html = '<html><body><p>x</p></body></html>';
        const out = ensureCtaSlot(html);
        expect(out).toContain(CTA_ATTR);
        expect(out).toContain('{{cta_href}}');
    });

    test('ensureCtaSlot keeps existing slot', () => {
        const html = `<a ${CTA_ATTR} href="{{cta_href}}">Go</a>`;
        expect(ensureCtaSlot(html)).toBe(html);
    });

    test('injectUtmAgent adds utm_agent to data-cta-slot href', () => {
        const html = `<a ${CTA_ATTR} href="https://example.com/offer">Btn</a>`;
        const out = injectUtmAgent(html, '42');
        expect(out).toContain('utm_agent=42');
        expect(out).toContain('https://example.com/offer?utm_agent=42');
    });

    test('injectUtmAgent works when href is before data-cta-slot', () => {
        const html = `<a href="https://example.com/x" ${CTA_ATTR}>Btn</a>`;
        const out = injectUtmAgent(html, '7');
        expect(out).toContain('utm_agent=7');
    });

    test('injectUtmAgent updates existing utm_agent', () => {
        const html = `<a ${CTA_ATTR} href="https://example.com/?utm_agent=old">Btn</a>`;
        const out = injectUtmAgent(html, 'new');
        expect(out).toContain('utm_agent=new');
        expect(out).not.toContain('utm_agent=old');
    });
});
