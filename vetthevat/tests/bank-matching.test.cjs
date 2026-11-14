const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const { parseStatementRows, matchTransactions, matchSummary, statementDate, namesSupplier } = loadSource('lib/bank-matching');

const inv = (id, supplierName, gross, vat, issuedOn) => ({ id, number: `N-${id}`, issuedOn, supplierName, net: gross - vat, vat, gross, currency: 'GBP' });

test('bank date formats and Excel serial dates', () => {
  assert.equal(statementDate('05/10/2026'), '2026-10-05');
  assert.equal(statementDate('05-10-26'), '2026-10-05');
  assert.equal(statementDate('2026-10-05'), '2026-10-05');
  assert.equal(statementDate('5 Oct 2026'), '2026-10-05');
  assert.equal(statementDate(45658), '2025-01-01');
  assert.equal(statementDate(46300), '2026-10-05');
  assert.equal(statementDate('31/02/2026'), null);
});

test('statement with Paid out / Paid in columns (NatWest/Barclays style)', () => {
  const parsed = parseStatementRows([
    ['Account', '12345678'], [],
    ['Date', 'Type', 'Description', 'Paid out', 'Paid in', 'Balance'],
    ['01/10/2026', 'DD', 'TEMPLE WINES C&C', '620.55', '', '1000.00'],
    ['02/10/2026', 'BAC', 'CARD SALES', '', '1,250.00', '2250.00'],
    ['', '', 'Balance brought forward', '', '', '']
  ]);
  assert.equal(parsed.transactions.length, 2);
  assert.deepEqual(parsed.transactions.map(t => [t.date, t.amount, t.direction]), [['2026-10-01', 620.55, 'out'], ['2026-10-02', 1250, 'in']]);
});

test('statement with one signed Amount column', () => {
  const parsed = parseStatementRows([['Transaction Date', 'Details', 'Amount'], ['05/10/2026', 'RK FRUITS', '-212.50'], ['06/10/2026', 'REFUND', '20.00']]);
  assert.deepEqual(parsed.transactions.map(t => [t.amount, t.direction]), [[212.5, 'out'], [20, 'in']]);
  assert.ok(parseStatementRows([['Foo', 'Bar'], ['1', '2']]).error);
});

test('supplier name check tolerates bank abbreviations', () => {
  assert.ok(namesSupplier('TEMPLE WINES C&C REF 295920', 'Temple Wines (Cash & Carry) Ltd'));
  assert.ok(namesSupplier('RK FRUITS AND VEG', 'RK FRUITS & VEGETABLES LIMITED'));
  assert.ok(!namesSupplier('TESCO STORES 2231', 'Temple Wines (Cash & Carry) Ltd'));
});

test('payments are matched to invoices and show their VAT; each invoice used once', () => {
  const invoices = [inv('a', 'Temple Wines (Cash & Carry) Ltd', 620.55, 95.09, '2026-09-01'), inv('b', 'RK Fruits & Vegetables Limited', 212.5, 0, '2026-10-26'), inv('c', 'Green Harvest Produce Ltd', 212.5, 0, '2026-10-20')];
  const rows = matchTransactions([
    { id: 't1', date: '2026-10-29', description: 'TEMPLE WINES', amount: 620.55, direction: 'out' },
    { id: 't2', date: '2026-10-30', description: 'FASTER PAYMENT 8842', amount: 212.5, direction: 'out' },
    { id: 't3', date: '2026-10-31', description: 'RK FRUITS', amount: 212.5, direction: 'out' },
    { id: 't4', date: '2026-11-01', description: 'BOOKER', amount: 99.99, direction: 'out' },
    { id: 't5', date: '2026-11-01', description: 'CARD SALES', amount: 500, direction: 'in' }
  ], invoices);
  assert.deepEqual(rows.map(r => [r.id, r.status, r.invoice?.id ?? null]), [['t1', 'Matched', 'a'], ['t2', 'Possible match', 'c'], ['t3', 'Matched', 'b'], ['t4', 'No invoice', null], ['t5', 'No invoice', null]]);
  assert.deepEqual(matchSummary(rows), { paymentsOut: 4, matched: 2, possible: 1, missing: 1, paidOut: 1145.54, vatEvidenced: 95.09, vatToConfirm: 0, unmatchedAmount: 99.99 });
});

test('payments far outside the invoice date are not matched', () => {
  const rows = matchTransactions([{ id: 't', date: '2027-06-01', description: 'TEMPLE WINES', amount: 620.55, direction: 'out' }], [inv('a', 'Temple Wines Ltd', 620.55, 95.09, '2026-09-01')]);
  assert.equal(rows[0].status, 'No invoice');
});
