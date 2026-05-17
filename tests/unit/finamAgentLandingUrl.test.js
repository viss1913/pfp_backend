const test = require('node:test');
const assert = require('node:assert/strict');
const {
    DEFAULT_FINAM_AGENT_LANDING,
    buildFinamAgentRegistrationUrl,
    buildFinamAgentReferralUrl,
    buildAgentFinamUrls,
} = require('../../src/utils/finamAgentLandingUrl');

const settings = {
    partner_agent_id: {
        finam_agent_landing_url: 'https://broker.finam.ru/landing/agent/',
    },
    partner_link_tracking: {
        enabled: true,
        domain_whitelist: ['broker.finam.ru'],
        defaults: { utm_source: 'pfp', utm_medium: 'report_pdf' },
        per_link_type: {
            agent_register: { utm_campaign: 'agent_landing' },
        },
        agent_id_param: 'utm_partner_finam',
    },
};

test('buildFinamAgentRegistrationUrl returns base without referrer', () => {
    const url = buildFinamAgentRegistrationUrl({ projectSettings: settings });
    assert.equal(url, DEFAULT_FINAM_AGENT_LANDING);
    assert.ok(!url.includes('utm_'));
});

test('buildFinamAgentRegistrationUrl adds parent partner id', () => {
    const url = buildFinamAgentRegistrationUrl({
        projectSettings: settings,
        referrerAgent: { partner_agent_id: 'CM123' },
    });
    assert.ok(url.includes('utm_partner_finam=CM123'));
    assert.ok(url.includes('utm_campaign=agent_landing'));
});

test('buildFinamAgentRegistrationUrl ignores referrer without partner_agent_id', () => {
    const url = buildFinamAgentRegistrationUrl({
        projectSettings: settings,
        referrerAgent: { partner_agent_id: null },
    });
    assert.equal(url, DEFAULT_FINAM_AGENT_LANDING);
});

test('buildFinamAgentReferralUrl null without own partner_agent_id', () => {
    assert.equal(
        buildFinamAgentReferralUrl({
            projectSettings: settings,
            agent: { partner_agent_id: null },
        }),
        null
    );
});

test('buildFinamAgentReferralUrl with own partner_agent_id', () => {
    const url = buildFinamAgentReferralUrl({
        projectSettings: settings,
        agent: { partner_agent_id: 'OWN99' },
    });
    assert.ok(url.includes('utm_partner_finam=OWN99'));
});

test('buildAgentFinamUrls uses parent when parent_agent_id set', () => {
    const urls = buildAgentFinamUrls({
        projectSettings: settings,
        agent: { parent_agent_id: 5, partner_agent_id: null },
        parentAgent: { partner_agent_id: 'PARENT1' },
    });
    assert.ok(urls.finam_agent_registration_url.includes('utm_partner_finam=PARENT1'));
    assert.equal(urls.finam_agent_referral_url, null);
});
