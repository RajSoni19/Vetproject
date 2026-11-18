const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const { periodRange, periodYears } = loadSource('lib/report-periods');

test('monthly, quarterly and yearly ranges cover whole calendar periods', () => {
  assert.deepEqual(periodRange('month', 2028, 1), { startsOn: '2028-02-01', endsOn: '2028-02-29', label: 'Feb-2028' });
  assert.deepEqual(periodRange('month', 2026, 11), { startsOn: '2026-12-01', endsOn: '2026-12-31', label: 'Dec-2026' });
  assert.deepEqual(periodRange('quarter', 2026, 0), { startsOn: '2026-01-01', endsOn: '2026-03-31', label: 'Q1-2026' });
  assert.deepEqual(periodRange('quarter', 2026, 3), { startsOn: '2026-10-01', endsOn: '2026-12-31', label: 'Q4-2026' });
  assert.deepEqual(periodRange('year', 2026), { startsOn: '2026-01-01', endsOn: '2026-12-31', label: '2026' });
});

test('years come from the invoices plus the current year, newest first', () => {
  assert.deepEqual(periodYears(['2024-03-01', '2026-01-02', 'bad', null], new Date('2027-05-01T00:00:00Z')), [2027, 2026, 2024]);
});
