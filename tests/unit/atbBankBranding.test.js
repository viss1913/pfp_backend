const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    DEFAULT_ATB_BANK_PROJECT_IDS,
    ATB_LIFE_PROGRAM_LABEL,
    ATB_LIFE_PROVIDER_LABEL,
    isAtbBankProject,
    applyAtbLifeGoalDisplay,
    applyAtbReportBranding,
    resolveLifeOfferEmailPayload,
} = require('../../src/utils/atbBankBranding');

test('ATB branding helper covers project 3 and legacy 28', () => {
    assert.deepEqual(DEFAULT_ATB_BANK_PROJECT_IDS, [3, 28]);
    assert.equal(isAtbBankProject(3), true);
    assert.equal(isAtbBankProject(28), true);
    assert.equal(isAtbBankProject(29), false);
});

test('ATB LIFE goal display rewrites Sber branding to SK Luchi', () => {
    const branded = applyAtbLifeGoalDisplay({
        programName: 'Подушка безопасности · Сбер Страхование Жизни',
        provider: 'Сбер Страхование жизни',
    }, 3);

    assert.equal(branded.programName, ATB_LIFE_PROGRAM_LABEL);
    assert.equal(branded.provider, ATB_LIFE_PROVIDER_LABEL);
});

test('ATB report branding replaces Sber labels in runtime html', () => {
    const html = applyAtbReportBranding(
        '<a href="https://sberbank-insurance.ru/podushka-bezopasnosti">Подушка безопасности · Сбер Страхование Жизни</a>',
        3
    );

    assert.match(html, /СК Лучи/);
    assert.doesNotMatch(html, /Сбер Страхование/i);
});

test('ATB email payload uses branded default description for project 3', () => {
    const payload = resolveLifeOfferEmailPayload(3, {});
    assert.match(payload.shortDescription, /СК Лучи/);
    assert.ok(String(payload.offerUrl || '').length > 0);
});
