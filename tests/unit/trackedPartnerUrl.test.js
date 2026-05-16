const test = require('node:test');
const assert = require('node:assert/strict');
const {
    appendQueryParams,
    buildTrackedPartnerUrl,
    applyTrackedPartnerUrlsToHtml,
} = require('../../src/utils/trackedPartnerUrl');

const settings = {
    partner_link_tracking: {
        enabled: true,
        domain_whitelist: ['finam.ru'],
        defaults: { utm_source: 'pfp', utm_medium: 'report_pdf' },
        per_link_type: { broker_open: { utm_campaign: 'open_account' } },
        agent_id_param: 'agent_id',
    },
};

test('appendQueryParams merges without dropping existing', () => {
    const out = appendQueryParams('https://www.finam.ru/open/order/russia/?foo=1', { bar: '2' });
    assert.ok(out.includes('foo=1'));
    assert.ok(out.includes('bar=2'));
});

test('buildTrackedPartnerUrl adds agent and utm', () => {
    const url = buildTrackedPartnerUrl('https://www.finam.ru/open/order/russia/', {
        linkType: 'broker_open',
        agent: { partner_agent_id: 'ABC123' },
        projectSettings: settings,
        clientId: 42,
    });
    assert.ok(url.includes('agent_id=ABC123'));
    assert.ok(url.includes('utm_source=pfp'));
    assert.ok(url.includes('utm_campaign=open_account'));
    assert.ok(url.includes('utm_content=42'));
});

test('buildTrackedPartnerUrl no-op when disabled', () => {
    const base = 'https://www.finam.ru/open/order/russia/';
    const url = buildTrackedPartnerUrl(base, {
        agent: { partner_agent_id: 'X' },
        projectSettings: { partner_link_tracking: { enabled: false } },
    });
    assert.equal(url, base);
});

test('applyTrackedPartnerUrlsToHtml', () => {
    const html =
        '<a href="https://www.finam.ru/open/order/russia/">x</a>';
    const out = applyTrackedPartnerUrlsToHtml(html, {
        enabled: true,
        agent: { partner_agent_id: 'Z9' },
        projectSettings: settings,
    });
    assert.ok(out.includes('agent_id=Z9'));
});
