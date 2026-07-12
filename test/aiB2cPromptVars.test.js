const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildPromptVarMap,
    substitutePromptVars,
} = require('../src/utils/aiB2cPromptVars');
const aiB2cService = require('../src/services/aiB2cService');

test('substitutePromptVars replaces {{agent}} and long forms', () => {
    const vars = buildPromptVarMap({
        session: {
            ref: 'ab2def5798ae',
            agent: {
                first_name: 'Иван',
                last_name: 'Петров',
                full_name: 'Иван Петров',
                display_name: 'Иван Петров',
            },
        },
        assistantName: 'Виктория',
    });

    const text =
        'Пригласил {{agent}}. Полное: {{agent_full_name}}. Имя: {{agent_first_name}}. Ассистент: {{assistant_name}}.';
    const out = substitutePromptVars(text, vars);
    assert.match(out, /Пригласил Иван Петров/);
    assert.match(out, /Полное: Иван Петров/);
    assert.match(out, /Имя: Иван/);
    assert.match(out, /Ассистент: Виктория/);
    assert.doesNotMatch(out, /\{\{/);
});

test('substitutePromptVars empty agent leaves blank placeholders', () => {
    const vars = buildPromptVarMap({ session: { ref: 'x' }, assistantName: '' });
    assert.equal(substitutePromptVars('Агент {{agent}}.', vars), 'Агент .');
});

test('_buildOrchestratorUserMessage includes referral agent block', () => {
    const text = aiB2cService._buildOrchestratorUserMessage({
        session: {
            ref: 'ab2def5798ae',
            agent: { full_name: 'Иван Петров' },
        },
        message: 'привет',
    });
    assert.match(text, /Иван Петров/);
    assert.match(text, /ab2def5798ae/);
});

test('_normalizeSessionAgent builds full_name from parts', () => {
    const agent = aiB2cService._normalizeSessionAgent({
        first_name: 'Иван',
        last_name: 'Петров',
    });
    assert.equal(agent.full_name, 'Иван Петров');
});
