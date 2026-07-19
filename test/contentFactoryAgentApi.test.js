const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CTA_ATTR } = require('../src/utils/contentFactoryHtml');
const {
    mapAgentOfferListItem,
    mapAgentOfferDetail,
    mapAgentOfferDeckItem,
    sortOffersByIds,
    needsIdeHtmlSync,
} = require('../src/services/contentFactoryService');

const sampleRow = {
    id: 12,
    title: 'НСЖ для семьи',
    kind: 'product',
    brief: 'Кратко о продукте',
    cta_label: 'Оформить',
    cta_url_base: 'https://bank.example/offer',
    published_at: '2026-07-14T10:00:00.000Z',
    expires_at: null,
    base_template_id: 'finam-a4-portrait-light',
    page_count: 1,
    ide_session_id: 'sess-secret',
    generated_html: `<html><body><a ${CTA_ATTR} href="#">{{cta_label}}</a></body></html>`,
    status: 'published',
};

test('mapAgentOfferListItem excludes html and admin fields', () => {
    const item = mapAgentOfferListItem(sampleRow);
    assert.equal(item.id, 12);
    assert.equal(item.title, 'НСЖ для семьи');
    assert.equal(item.cta_label, 'Оформить');
    assert.equal(item.page_count, 1);
    assert.equal('generated_html' in item, false);
    assert.equal('ide_session_id' in item, false);
    assert.equal('preview_html' in item, false);
});

test('mapAgentOfferDetail includes preview_html with CTA and no utm', () => {
    const detail = mapAgentOfferDetail(sampleRow);
    assert.equal(detail.cta_url_base, 'https://bank.example/offer');
    assert.ok(detail.preview_html);
    assert.ok(detail.preview_html.includes('https://bank.example/offer'));
    assert.ok(detail.preview_html.includes('Оформить'));
    assert.ok(!detail.preview_html.includes('utm_agent'));
    assert.equal('generated_html' in detail, false);
});

test('mapAgentOfferDeckItem includes preview_html for presentation slides', () => {
    const deckItem = mapAgentOfferDeckItem(sampleRow);
    assert.equal(deckItem.id, 12);
    assert.ok(deckItem.preview_html);
    assert.ok(!deckItem.preview_html.includes('utm_agent'));
});

test('sortOffersByIds preserves presentation order', () => {
    const rows = [
        { id: 5, title: 'B' },
        { id: 12, title: 'A' },
        { id: 8, title: 'C' },
    ];
    const ordered = sortOffersByIds([12, 5, 8], rows);
    assert.deepEqual(
        ordered.map((row) => row.id),
        [12, 5, 8],
    );
});

test('sortOffersByIds skips missing ids', () => {
    const rows = [{ id: 5, title: 'B' }];
    const ordered = sortOffersByIds([99, 5], rows);
    assert.deepEqual(ordered.map((row) => row.id), [5]);
});

test('needsIdeHtmlSync detects unresolved IDE placeholders and asset paths', () => {
    assert.equal(needsIdeHtmlSync('<img src="__CF_DATA_URI_0__">'), true);
    assert.equal(needsIdeHtmlSync('background-image:url(assets/hero.png)'), true);
    assert.equal(needsIdeHtmlSync('<img src="data:image/png;base64,abc">'), false);
});
