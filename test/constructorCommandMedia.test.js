const test = require('node:test');
const assert = require('node:assert/strict');
const {
    parseCommandMedia,
    inferMediaType,
} = require('../src/utils/constructorCommandMedia');

test('inferMediaType detects pdf as document', () => {
    assert.equal(inferMediaType('application/pdf', 'deck.pdf'), 'document');
    assert.equal(inferMediaType('', 'presentation.PDF'), 'document');
});

test('parseCommandMedia keeps document type', () => {
    const items = parseCommandMedia([
        {
            id: 'a',
            type: 'document',
            url: 'https://cdn.example.com/foa.pdf',
            filename: 'foa.pdf',
            mime: 'application/pdf',
            sort: 0,
        },
    ]);
    assert.equal(items.length, 1);
    assert.equal(items[0].type, 'document');
});

test('parseCommandMedia infers document from pdf mime', () => {
    const items = parseCommandMedia([
        {
            url: 'https://cdn.example.com/x.pdf',
            mime: 'application/pdf',
            filename: 'x.pdf',
        },
    ]);
    assert.equal(items[0].type, 'document');
});
