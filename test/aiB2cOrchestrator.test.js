const test = require('node:test');
const assert = require('node:assert/strict');

const aiB2cService = require('../src/services/aiB2cService');

test('normalizeRoutingCommand prefers whitelist command', () => {
    const allowed = ['/start', '/vybor_celi2', '/testSyte'];
    const result = aiB2cService._normalizeRoutingCommand(
        'Пользователь хочет пенсию\n/vybor_celi2',
        allowed,
        '/start'
    );
    assert.equal(result, '/vybor_celi2');
});

test('stage key candidates include slash variants', () => {
    const candidates = aiB2cService._stageKeyCandidates('/testSyte');
    assert.deepEqual(candidates, ['/testSyte', 'testSyte']);
});

test('_buildOrchestratorUserMessage merges chat and UI event', () => {
    const text = aiB2cService._buildOrchestratorUserMessage({
        event: 'goal_selected',
        goal_type_id: 1,
        goal_name: 'Пенсия',
        message: 'хочу 200 000',
    });
    assert.match(text, /goal_selected/);
    assert.match(text, /200 000/);
});

test('_normalizeFlowKey falls back to default', () => {
    assert.equal(aiB2cService._normalizeFlowKey(''), 'default');
    assert.equal(aiB2cService._normalizeFlowKey('plan'), 'plan');
});
