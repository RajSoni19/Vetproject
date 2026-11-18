const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const { applyDecisions, nameKey, parseStatementRows, matchTransactions, matchSummary, statementDate, namesSupplier } = loadSource('lib/bank-matching');
const { accountantWorkbook, periodOptions, rowsInPeriod } = loadSource('lib/bank-vat-export');

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

test('accountant list: Supplier, Amount, Date are all payments out, in any column order', () => {
  const parsed = parseStatementRows([['Supplier', 'Amount', 'Date'], ['Temple Wines', '£620.55', '01/10/2026'], ['RK Fruits', 212.5, 46300], ['', '', '']]);
  assert.deepEqual(parsed.transactions.map(t => [t.description, t.amount, t.date, t.direction]), [['Temple Wines', 620.55, '2026-10-01', 'out'], ['RK Fruits', 212.5, '2026-10-05', 'out']]);
  assert.equal(parseStatementRows([['Date', 'Total', 'Supplier name'], ['01/10/2026', 5, 'A Ltd']]).transactions[0].description, 'A Ltd');
});

test('the Excel from the client meeting: every row is a payment and matches its invoice', () => {
  const parsed = parseStatementRows([['Invoice number', 'Supplier', 'Date', 'Amount', ''],
    ['30739', 'INDUSTRIAL HYGIENE UK LTD', '2026-07-21', 615.43, ''], ['INV-000113', 'RK FRUITS & VEGETABLES LIMITED', '2026-11-02', 432, ''],
    ['291156', 'Temple Wines (Cash & Carry) Ltd', '2026-06-12', 738.94, ''], ['INV-000103', 'QUKDEEP FOODS LIMITED', '2026-10-10', 263, '']]);
  assert.ok(parsed.transactions.every(t => t.direction === 'out'));
  const rows = matchTransactions(parsed.transactions, [inv('h', 'INDUSTRIAL HYGIENE UK LTD', 615.43, 102.57, '2026-07-21'), inv('r', 'RK FRUITS & VEGETABLES LIMITED', 432, 0, '2026-11-02'), inv('t', 'Temple Wines (Cash & Carry) Ltd', 738.94, 123.16, '2026-06-12')]);
  assert.deepEqual(rows.map(r => [r.status, r.invoice?.vat ?? null]), [['Matched', 102.57], ['Matched', 0], ['Matched', 123.16], ['No invoice', null]]);
});

test('month-first files are recognised; ambiguous files stay UK', () => {
  assert.deepEqual(parseStatementRows([['Supplier', 'Amount', 'Date'], ['A', 1, '11/05/2026'], ['B', 2, '11/25/2026']]).transactions.map(t => t.date), ['2026-11-05', '2026-11-25']);
  assert.equal(parseStatementRows([['Supplier', 'Amount', 'Date'], ['A', 1, '11/05/2026']]).transactions[0].date, '2026-05-11');
});

test('same amount with a distant date or other name waits for a person', () => {
  const invoice = inv('a', 'Temple Wines Ltd', 620.55, 95.09, '2026-09-01');
  const far = matchTransactions([{ id: 't', date: '2027-06-01', description: 'TEMPLE WINES', amount: 620.55, direction: 'out' }], [invoice]);
  assert.deepEqual([far[0].status, far[0].invoice.id], ['Possible match', 'a']);
  assert.match(far[0].reason, /date is far/);
  const other = matchTransactions([{ id: 't', date: '2026-09-02', description: 'TW PAYMENTS', amount: 620.55, direction: 'out' }], [invoice]);
  assert.equal(other[0].status, 'Possible match');
});

test('identical invoices are not guessed; a confirmed name is remembered', () => {
  const twins = [inv('a', 'RK Fruits Ltd', 264, 0, '2026-10-10'), inv('b', 'RK Fruits Ltd', 264, 0, '2026-10-12')];
  const row = matchTransactions([{ id: 't', date: '2026-10-15', description: 'RK FRUITS', amount: 264, direction: 'out' }], twins)[0];
  assert.equal(row.status, 'Possible match');
  assert.equal(row.candidates.length, 2);
  const payment = { id: 't', date: '2026-09-02', description: 'TW PAYMENTS', amount: 620.55, direction: 'out' }, invoice = inv('a', 'Temple Wines Ltd', 620.55, 95.09, '2026-09-01');
  assert.equal(matchTransactions([payment], [invoice], { [nameKey('TW PAYMENTS')]: nameKey('Temple Wines Ltd') })[0].status, 'Matched');
});

test('decisions verify, reject and move invoices between payments', () => {
  const invoices = [inv('a', 'Acme Foods Ltd', 50, 10, '2026-10-01')];
  const payments = [{ id: 't1', date: '2026-10-02', description: 'ACME FOODS', amount: 50, direction: 'out' }, { id: 't2', date: '2026-10-03', description: 'OTHER', amount: 50, direction: 'out' }];
  const rows = matchTransactions(payments, invoices);
  assert.deepEqual(rows.map(r => r.status), ['Matched', 'No invoice']);
  const moved = applyDecisions(rows, { t2: 'a' }, invoices);
  assert.deepEqual(moved.map(r => [r.status, r.invoice?.id ?? null]), [['No invoice', null], ['Matched', 'a']]);
  assert.equal(applyDecisions(rows, { t1: null }, invoices)[0].status, 'No invoice');
});

test('accountant Excel: VAT only on verified payments, UK dates, links, safe text, period filter', () => {
  const XLSX = require('xlsx');
  const invoices = [inv('a', 'Temple Wines Ltd', 120, 20, '2026-10-01')];
  const rows = matchTransactions([
    { id: 't1', date: '2026-10-02', description: 'TEMPLE WINES', amount: 120, direction: 'out' },
    { id: 't2', date: '2026-11-03', description: '=HACK()', amount: 30, direction: 'out' },
    { id: 't3', date: '2026-11-04', description: 'CARD SALES', amount: 9, direction: 'in' }
  ], invoices);
  assert.deepEqual(periodOptions(rows).map(p => p.key), ['all', 'm:2026-11', 'm:2026-10', 'q:2026-Q4']);
  assert.equal(rowsInPeriod(rows, 'm:2026-11').length, 1);
  const book = XLSX.read(XLSX.write(accountantWorkbook(rows, { company: 'Demo', statement: 's.csv', period: 'All dates', origin: 'https://app.test' }), { type: 'buffer', bookType: 'xlsx' }), { cellNF: true });
  const sheet = book.Sheets['Bank VAT'];
  assert.deepEqual(['A1', 'B1', 'C1', 'D1', 'E1', 'F1'].map(c => sheet[c].v), ['Date', 'Supplier', 'Amount', 'Verified', 'VAT', 'Net']);
  assert.deepEqual([sheet.B2.v, sheet.C2.v, sheet.D2.v, sheet.E2.v, sheet.F2.v, sheet.G2.v], ['TEMPLE WINES', 120, true, 20, 100, 'N-a']);
  assert.equal(sheet.A2.z, 'dd/mm/yyyy');
  assert.equal(sheet.K2.l.Target, 'https://app.test/app/invoices/a?pdf=1');
  assert.deepEqual([sheet.B3.v, sheet.B3.f, sheet.D3.v, sheet.E3.v, sheet.F3.v], ["'=HACK()", undefined, false, 0, 30]);
  assert.equal(sheet.A4, undefined);
  assert.deepEqual(XLSX.utils.sheet_to_json(book.Sheets.Summary, { header: 1 }).find(r => r[0] === 'VAT to claim'), ['VAT to claim', 20]);
});
