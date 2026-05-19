const { test } = require('node:test');
const assert = require('node:assert/strict');
const { canParentInviteSubagent } = require('../../src/services/agentNetworkService');

test('canParentInviteSubagent: depth 0, max 1 → ok', () => {
    assert.equal(canParentInviteSubagent(0, 1), true);
});

test('canParentInviteSubagent: depth 1, max 1 → fail', () => {
    assert.equal(canParentInviteSubagent(1, 1), false);
});

test('canParentInviteSubagent: depth 1, max 2 → ok', () => {
    assert.equal(canParentInviteSubagent(1, 2), true);
});

test('canParentInviteSubagent: depth 2, max 2 → fail', () => {
    assert.equal(canParentInviteSubagent(2, 2), false);
});

test('canParentInviteSubagent: invalid max defaults to 1', () => {
    assert.equal(canParentInviteSubagent(0, 0), true);
    assert.equal(canParentInviteSubagent(1, 0), false);
});
