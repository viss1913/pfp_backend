const test = require('node:test');
const assert = require('node:assert/strict');
const {
    parseStrictClassifierCommandFromLlm,
    isClassifierLlmResponseValidCommand,
    parseClassifierCommandFromLlm,
    userMessageImpliesAdvanceToNextStage,
} = require('../src/services/constructorAiService');

const commands = [
    { id: 22, command: '/platform_1' },
    { id: 23, command: '/platform_2' },
    { id: 24, command: '/platform_3' },
    { id: 25, command: '/platform_4' },
];

test('parseStrictClassifierCommandFromLlm accepts single command line', () => {
    assert.equal(parseStrictClassifierCommandFromLlm('/platform_4', commands)?.command, '/platform_4');
    assert.equal(parseStrictClassifierCommandFromLlm('  /platform_2  \n', commands)?.command, '/platform_2');
});

test('parseStrictClassifierCommandFromLlm rejects prose and multi-line', () => {
    assert.equal(parseStrictClassifierCommandFromLlm('', commands), null);
    assert.equal(
        parseStrictClassifierCommandFromLlm('Саша, идем дальше\n/platform_4', commands),
        null
    );
    const prose =
        'Саша, мы уже знаем цели.\n\nОтветь /platform_3\n\n/platform_4';
    assert.equal(parseStrictClassifierCommandFromLlm(prose, commands), null);
});

test('loose parser used to pick /platform_3 from prose — strict does not', () => {
    const prose =
        'Саша, стартовый капитал важен. Остаёмся на /platform_3 для обсуждения.';
    assert.equal(parseClassifierCommandFromLlm(prose, commands, commands[2])?.command, '/platform_3');
    assert.equal(parseStrictClassifierCommandFromLlm(prose, commands), null);
    assert.equal(isClassifierLlmResponseValidCommand(prose, commands), false);
});

test('userMessageImpliesAdvanceToNextStage covers ок дальше', () => {
    assert.equal(userMessageImpliesAdvanceToNextStage('Ок, дальше'), true);
    assert.equal(userMessageImpliesAdvanceToNextStage('ок дальше'), true);
});
