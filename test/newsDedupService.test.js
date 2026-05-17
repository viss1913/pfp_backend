'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { normalizeTitle, buildClusterKey } = require('../src/services/news/newsDedupService');

test('normalizeTitle strips punctuation and stop words', () => {
    const a = normalizeTitle('ЦБ сообщил: ключевая ставка без изменений');
    const b = normalizeTitle('Ключевая ставка без изменений, сообщил ЦБ');
    assert.ok(a.length > 0);
    assert.ok(b.length > 0);
    assert.strictEqual(a, b);
});

test('buildClusterKey matches same normalized headline same day', () => {
    const day = new Date('2026-05-17T10:00:00Z');
    const k1 = buildClusterKey('ЦБ сохранил ключевую ставку без изменений', day);
    const k2 = buildClusterKey('ЦБ сохранил ключевую ставку без изменений!', day);
    assert.strictEqual(k1, k2);
});

test('buildClusterKey differs across days', () => {
    const k1 = buildClusterKey('Инфляция в России замедлилась', new Date('2026-05-16T10:00:00Z'));
    const k2 = buildClusterKey('Инфляция в России замедлилась', new Date('2026-05-17T10:00:00Z'));
    assert.notStrictEqual(k1, k2);
});
