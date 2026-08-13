const test = require('node:test');
const assert = require('node:assert/strict');
const { addCalendarMonths, firstScheduleMonthAfterStart } = require('../src/utils/calendarMonth');

function fmt(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test('July 31 start: five months Aug–Dec without skipping September', () => {
    let d = firstScheduleMonthAfterStart(new Date(2026, 6, 31));
    const labels = [];
    for (let i = 0; i < 5; i++) {
        labels.push(fmt(d));
        d = addCalendarMonths(d, 1);
    }
    assert.deepEqual(labels, [
        '2026-08-01',
        '2026-09-01',
        '2026-10-01',
        '2026-11-01',
        '2026-12-01',
    ]);
});

test('Jan 31 start: Feb exists (not Mar 1 skip)', () => {
    const feb = addCalendarMonths(new Date(2026, 0, 31), 1);
    assert.equal(fmt(feb), '2026-02-01');
});
