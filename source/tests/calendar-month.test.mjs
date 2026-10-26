import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarMonthDays, isCalendarMonth, shiftCalendarMonth } from '../lib/calendar-month.ts';

const key = (date) => `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

test('calendar navigation crosses years without changing the selected month day or overflowing the supported years', () => {
  assert.equal(shiftCalendarMonth('2026-12', 1), '2027-01');
  assert.equal(shiftCalendarMonth('2027-01', -1), '2026-12');
  assert.equal(shiftCalendarMonth('2024-02', 12), '2025-02');
  assert.equal(shiftCalendarMonth('0001-01', -1), '0001-01');
  assert.equal(shiftCalendarMonth('9999-12', 1), '9999-12');
  for (const value of ['2026-00', '2026-13', '0000-01', '2026-1', 'invalid']) assert.equal(isCalendarMonth(value), false);
});

test('month grids include every date, leap days and complete weeks, including months that require six rows', () => {
  for (const [month, expected, rows] of [['2024-02', 29, 5], ['2025-02', 28, 5], ['2026-02', 28, 4], ['2026-08', 31, 6], ['2026-10', 31, 5], ['2027-01', 31, 6], ['0001-02', 28, 5]]) {
    const days = calendarMonthDays(month);
    assert.equal(days.length, rows * 7, month);
    assert.equal(days[0].getDay(), 0);
    assert.equal(days.at(-1).getDay(), 6);
    assert.deepEqual(days.filter((date) => key(date).startsWith(month)).map((date) => date.getDate()), Array.from({ length: expected }, (_, i) => i + 1));
    assert.equal(new Set(days.map(key)).size, days.length);
  }
});
