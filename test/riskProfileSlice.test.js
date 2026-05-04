'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
    portfolioHasFiveRiskSlices,
    findPortfolioRiskProfileRow
} = require('../src/algorithms/calculators/riskProfileSlice');

const threeSlices = [
    { profile_type: 'CONSERVATIVE', instruments: [] },
    { profile_type: 'BALANCED', instruments: [] },
    { profile_type: 'AGGRESSIVE', instruments: [] }
];

const fiveSlices = [
    { profile_type: 'CONSERVATIVE', instruments: [] },
    { profile_type: 'MODERATELY_CONSERVATIVE', instruments: [] },
    { profile_type: 'BALANCED', instruments: [] },
    { profile_type: 'MODERATELY_AGGRESSIVE', instruments: [{ product_id: 1, share_percent: 100 }] },
    { profile_type: 'AGGRESSIVE', instruments: [] }
];

test('portfolioHasFiveRiskSlices: false for classic three', () => {
    assert.strictEqual(portfolioHasFiveRiskSlices(threeSlices), false);
});

test('portfolioHasFiveRiskSlices: true when MODERATELY present', () => {
    assert.strictEqual(portfolioHasFiveRiskSlices(fiveSlices), true);
});

test('findPortfolioRiskProfileRow: three-slice portfolio ignores extended, uses risk_profile', () => {
    const goal = {
        risk_profile: 'BALANCED',
        risk_profile_extended: 'MODERATELY_AGGRESSIVE'
    };
    const { profile, searchKeyUsed } = findPortfolioRiskProfileRow(threeSlices, goal);
    assert.strictEqual(searchKeyUsed, 'BALANCED');
    assert.strictEqual(profile.profile_type, 'BALANCED');
});

test('findPortfolioRiskProfileRow: five-slice uses extended when present', () => {
    const goal = {
        risk_profile: 'BALANCED',
        risk_profile_extended: 'MODERATELY_AGGRESSIVE'
    };
    const { profile, searchKeyUsed } = findPortfolioRiskProfileRow(fiveSlices, goal);
    assert.strictEqual(searchKeyUsed, 'MODERATELY_AGGRESSIVE');
    assert.strictEqual(profile.profile_type, 'MODERATELY_AGGRESSIVE');
    assert.ok(profile.instruments.length >= 1);
});

test('findPortfolioRiskProfileRow: five-slice falls back to risk_profile when no extended', () => {
    const goal = { risk_profile: 'CONSERVATIVE' };
    const { profile, searchKeyUsed } = findPortfolioRiskProfileRow(fiveSlices, goal);
    assert.strictEqual(searchKeyUsed, 'CONSERVATIVE');
    assert.strictEqual(profile.profile_type, 'CONSERVATIVE');
});

test('findPortfolioRiskProfileRow: five-slice reads extended from risk_profile_details', () => {
    const goal = {
        risk_profile: 'BALANCED',
        risk_profile_details: { risk_profile_extended: 'MODERATELY_CONSERVATIVE' }
    };
    const { profile, searchKeyUsed } = findPortfolioRiskProfileRow(fiveSlices, goal);
    assert.strictEqual(searchKeyUsed, 'MODERATELY_CONSERVATIVE');
    assert.strictEqual(profile.profile_type, 'MODERATELY_CONSERVATIVE');
});

test('findPortfolioRiskProfileRow: five-slice extended row missing falls back to risk_profile', () => {
    const thinFive = [
        { profile_type: 'MODERATELY_CONSERVATIVE', instruments: [] },
        { profile_type: 'BALANCED', instruments: [] }
    ];
    const goal = {
        risk_profile: 'BALANCED',
        risk_profile_extended: 'AGGRESSIVE'
    };
    const { profile, searchKeyUsed } = findPortfolioRiskProfileRow(thinFive, goal);
    assert.strictEqual(searchKeyUsed, 'BALANCED');
    assert.strictEqual(profile.profile_type, 'BALANCED');
});
