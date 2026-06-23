const assert = require('node:assert/strict');
const test = require('node:test');

const {
    resolveRostechStyleReportBranding,
    ROSTECH_BRANDING,
    NPF_RENESSANS_BRANDING,
} = require('../src/reports/themes/rostech/rostechStyleReportBranding');

test('resolveRostechStyleReportBranding: project 22 keeps Rostech copy', () => {
    const brand = resolveRostechStyleReportBranding(22);
    assert.equal(brand, ROSTECH_BRANDING);
    assert.match(brand.pdsContractStep, /Ростех/);
    assert.equal(brand.startPdsUrl, 'https://lk.rostecnpf.ru/new-contract/pds/');
});

test('resolveRostechStyleReportBranding: project 4 uses Renaissance copy and PDS shop URL', () => {
    const brand = resolveRostechStyleReportBranding(4);
    assert.equal(brand, NPF_RENESSANS_BRANDING);
    assert.match(brand.pdsContractStep, /Ренессанс Накопления/);
    assert.doesNotMatch(brand.pdsContractStep, /Ростех/);
    assert.equal(brand.startPdsUrl, 'https://shop.rensave.ru/products/pds');
    assert.equal(brand.useRostechLogo, false);
});
