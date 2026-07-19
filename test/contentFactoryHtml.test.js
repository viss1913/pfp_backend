const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    fillPlaceholders,
    ensureCtaSlot,
    injectUtmAgent,
    applyCtaToOfferHtml,
    buildPdfHtml,
    hasCtaSlot,
    CTA_ATTR,
} = require('../src/utils/contentFactoryHtml');

test('fillPlaceholders replaces known keys', () => {
    const html = '<h1>{{title}}</h1><p>{{body}}</p>';
    const out = fillPlaceholders(html, { title: 'Hello', body: 'World' });
    assert.equal(out, '<h1>Hello</h1><p>World</p>');
});

test('ensureCtaSlot appends data-cta-slot if missing', () => {
    const html = '<html><body><p>x</p></body></html>';
    const out = ensureCtaSlot(html);
    assert.ok(out.includes(CTA_ATTR));
    assert.ok(out.includes('{{cta_href}}'));
});

test('ensureCtaSlot keeps existing slot', () => {
    const html = `<a ${CTA_ATTR} href="{{cta_href}}">Go</a>`;
    assert.equal(ensureCtaSlot(html), html);
});

test('injectUtmAgent adds utm_agent to data-cta-slot href', () => {
    const html = `<a ${CTA_ATTR} href="https://example.com/offer">Btn</a>`;
    const out = injectUtmAgent(html, '42');
    assert.ok(out.includes('utm_agent=42'));
});

test('applyCtaToOfferHtml sets href and label', () => {
    const html = `<a ${CTA_ATTR} href="#">{{cta_label}}</a>`;
    const out = applyCtaToOfferHtml(html, {
        cta_url_base: 'https://bank.example/offer',
        cta_label: 'Оформить',
    });
    assert.ok(out.includes('https://bank.example/offer'));
    assert.ok(out.includes('Оформить'));
    assert.ok(!out.includes('{{cta_label}}'));
});

test('buildPdfHtml applies CTA and utm', () => {
    const html = `<a ${CTA_ATTR} href="#">{{cta_label}}</a>`;
    const offer = { cta_url_base: 'https://x.com/p', cta_label: 'Go' };
    const out = buildPdfHtml(html, offer, '99');
    assert.ok(out.includes('https://x.com/p'));
    assert.ok(out.includes('utm_agent=99'));
});

test('hasCtaSlot detects slot', () => {
    assert.equal(hasCtaSlot(`<a ${CTA_ATTR}>`), true);
    assert.equal(hasCtaSlot('<a href="#">x</a>'), false);
});
