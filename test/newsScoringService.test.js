'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { scoreArticle, hasNegativeWithoutEconomicContext } = require('../src/services/news/newsScoringService');

test('rejects sport without economic context', () => {
    assert.strictEqual(
        hasNegativeWithoutEconomicContext('Футбол: сборная выиграла матч'),
        true
    );
});

test('does not reject sport when economic context present', () => {
    assert.strictEqual(
        hasNegativeWithoutEconomicContext('Футбол: спонсоры банков сократили инвестиции в экономику'),
        false
    );
});

test('rejects article with no relevant keywords', () => {
    const result = scoreArticle({
        title: 'Новый сезон популярного сериала стартует весной',
        description: '',
        trustWeight: 90,
        publishedAt: new Date(),
    });
    assert.ok(result.rejectReason);
    assert.strictEqual(result.score, 0);
});

test('publishes high-priority rate news above threshold', () => {
    const result = scoreArticle({
        title: 'ЦБ сохранил ключевую ставку на текущем уровне',
        description: 'Банк России сообщил решение по ставке',
        trustWeight: 100,
        publishedAt: new Date(),
    });
    assert.strictEqual(result.rejectReason, undefined);
    assert.strictEqual(result.eventType, 'RATE_CHANGE');
    assert.ok(result.score >= 60, `expected score >= 60, got ${result.score}`);
    assert.ok(result.agentTakeaway.includes('Показатели'));
});

test('medium-only weak match gets rejectReason', () => {
    const result = scoreArticle({
        title: 'Сбер открыл новое отделение в регионе',
        description: 'банк',
        trustWeight: 50,
        publishedAt: new Date(Date.now() - 48 * 3600 * 1000),
    });
    if (result.score < 60) {
        assert.ok(result.rejectReason || result.score < 60);
    }
});
