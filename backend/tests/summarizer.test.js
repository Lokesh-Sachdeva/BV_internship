const test = require('node:test');
const assert = require('node:assert/strict');

const { summarise } = require('../summarizer');

test('summarise returns content for short input with LSA', () => {
    const result = summarise('Cats sleep. Dogs play.', 1);

    assert.ok(Array.isArray(result.sentences));
    assert.ok(result.sentences.length > 0);
    assert.ok(Array.isArray(result.keywords));
});
