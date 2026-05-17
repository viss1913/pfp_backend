const test = require('node:test');
const assert = require('node:assert/strict');
const {
    appendQueryParams,
    buildTrackedPartnerUrl,
    applyTrackedPartnerUrlsToHtml,
    inferLinkTypeFromUrl,
} = require('../../src/utils/trackedPartnerUrl');

const settings = {
    partner_link_tracking: {
        enabled: true,
        domain_whitelist: ['finam.ru', 'funds.finam.ru', 'comon.ru'],
        defaults: { utm_source: 'pfp', utm_medium: 'report_pdf' },
        per_link_type: {
            broker_open: { utm_campaign: 'open_account' },
            agent_register: { utm_campaign: 'agent_landing' },
            idu: { utm_campaign: 'idu' },
            comon: { utm_campaign: 'comon_autofollow' },
        },
        agent_id_param: 'utm_partner_finam',
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
    assert.ok(url.includes('utm_partner_finam=ABC123'));
    assert.ok(url.includes('utm_source=pfp'));
    assert.ok(url.includes('utm_campaign=open_account'));
    assert.ok(url.includes('utm_content=42'));
});

test('buildTrackedPartnerUrl without partner_agent_id keeps base URL without utm', () => {
    const base = 'https://www.finam.ru/open/order/russia/';
    const url = buildTrackedPartnerUrl(base, {
        linkType: 'broker_open',
        agent: { partner_agent_id: null },
        projectSettings: settings,
        clientId: 99,
    });
    assert.equal(url, base);
    assert.ok(!url.includes('utm_'));
});

test('buildTrackedPartnerUrl no-op when disabled', () => {
    const base = 'https://www.finam.ru/open/order/russia/';
    const url = buildTrackedPartnerUrl(base, {
        agent: { partner_agent_id: 'X' },
        projectSettings: { partner_link_tracking: { enabled: false } },
    });
    assert.equal(url, base);
});

test('applyTrackedPartnerUrlsToHtml without partner_agent_id leaves href unchanged', () => {
    const html = '<a href="https://www.finam.ru/open/order/russia/">x</a>';
    const out = applyTrackedPartnerUrlsToHtml(html, {
        enabled: true,
        agent: { id: 1, partner_agent_id: null },
        projectSettings: settings,
    });
    assert.equal(out, html);
});

test('applyTrackedPartnerUrlsToHtml', () => {
    const html =
        '<a href="https://www.finam.ru/open/order/russia/">x</a>';
    const out = applyTrackedPartnerUrlsToHtml(html, {
        enabled: true,
        agent: { partner_agent_id: 'Z9' },
        projectSettings: settings,
    });
    assert.ok(out.includes('utm_partner_finam=Z9'));
});

test('buildTrackedPartnerUrl tracks comon.ru strategy links', () => {
    const url = buildTrackedPartnerUrl('https://www.comon.ru/strategies/109003/', {
        agent: { partner_agent_id: 'CM1' },
        projectSettings: settings,
    });
    assert.ok(url.includes('utm_partner_finam=CM1'));
    assert.ok(url.includes('utm_campaign=comon_autofollow'));
});

test('buildTrackedPartnerUrl tracks funds.finam.ru idu', () => {
    const url = buildTrackedPartnerUrl('https://funds.finam.ru/idu/key-rate/', {
        agent: { partner_agent_id: 'DU9' },
        projectSettings: settings,
    });
    assert.ok(url.includes('utm_partner_finam=DU9'));
    assert.ok(url.includes('utm_campaign=idu'));
});

test('inferLinkTypeFromUrl detects agent landing', () => {
    assert.equal(
        inferLinkTypeFromUrl('https://broker.finam.ru/landing/agent/'),
        'agent_register'
    );
});

test('buildTrackedPartnerUrl tracks agent_register landing', () => {
    const url = buildTrackedPartnerUrl('https://broker.finam.ru/landing/agent/', {
        agent: { partner_agent_id: 'AG77' },
        projectSettings: {
            ...settings,
            partner_link_tracking: {
                ...settings.partner_link_tracking,
                domain_whitelist: ['broker.finam.ru'],
            },
        },
    });
    assert.ok(url.includes('utm_partner_finam=AG77'));
    assert.ok(url.includes('utm_campaign=agent_landing'));
});

test('buildTrackedPartnerUrl applies paramOverrides (email medium)', () => {
    const url = buildTrackedPartnerUrl('https://www.finam.ru/open/order/russia/', {
        linkType: 'broker_open',
        agent: { partner_agent_id: 'P1' },
        projectSettings: settings,
        paramOverrides: { utm_medium: 'email' },
    });
    assert.ok(url.includes('utm_medium=email'));
    assert.ok(url.includes('utm_partner_finam=P1'));
});
