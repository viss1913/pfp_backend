const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseSseEvents } = require('../src/services/ideContentHtmlClient');

test('parseSseEvents parses hello progress result done', () => {
    const raw = [
        'event: hello',
        'data: {"ok":true}',
        '',
        'event: progress',
        'data: {"agent":"code_generator","message":"working"}',
        '',
        'event: result',
        'data: {"html":"<html></html>","assistant_message":"done"}',
        '',
        'event: done',
        'data: {"ok":true}',
        '',
    ].join('\n');
    const events = parseSseEvents(raw);
    assert.equal(events.length, 4);
    assert.deepEqual(events[0], { event: 'hello', data: { ok: true } });
    assert.equal(events[2].event, 'result');
    assert.equal(events[2].data.html, '<html></html>');
});

test('parseSseEvents parses error event', () => {
    const raw = 'event: error\ndata: {"error":"cta_slot_removed","message":"bad"}\n\n';
    const events = parseSseEvents(raw);
    assert.equal(events[0].data.error, 'cta_slot_removed');
});
