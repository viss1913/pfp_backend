const test = require('node:test');
const assert = require('node:assert/strict');
const {
    stampGoalsSummarySnapshot,
    stringifyGoalsSummarySnapshot,
} = require('../../src/utils/goalsSummaryPersist');

test('stampGoalsSummarySnapshot sets generated_at', () => {
    const at = new Date('2026-05-23T18:00:00.000Z');
    const stamped = stampGoalsSummarySnapshot({ summary: {}, goals: [] }, at);
    assert.equal(stamped.generated_at, '2026-05-23T18:00:00.000Z');
    const parsed = JSON.parse(stringifyGoalsSummarySnapshot({ goals: [] }, at));
    assert.equal(parsed.generated_at, '2026-05-23T18:00:00.000Z');
});
