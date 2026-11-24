const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const { parseAiStatement, statementTable } = loadSource('lib/ai-statement');
const { parseStatementRows, matchTransactions } = loadSource('lib/bank-matching');
const { invoiceExtractHandler } = loadSource('lib/server/saas/invoice-extract-http');

test('statement reading: keeps real transactions, drops rows without a date or amount', () => {
  const statement = parseAiStatement({ rows: [
    { date: '2026-11-21', description: 'EVEREST ICES LONDON', paid_out: 60.19, paid_in: null },
    { date: '2026-11-22', description: 'CARD SALES', paid_out: null, paid_in: 250 },
    { date: null, description: 'BALANCE BROUGHT FORWARD', paid_out: null, paid_in: null },
    { date: '2026-11-23', description: 'NO AMOUNT', paid_out: null, paid_in: null },
    { date: '21/11/2026', description: 'WRONG DATE FORMAT', paid_out: 5, paid_in: null }
  ] });
  assert.equal(statement.rows.length, 2);
  assert.throws(() => parseAiStatement({ nope: [] }));
});

test('a photographed statement matches saved invoices exactly like a spreadsheet', () => {
  const table = statementTable(parseAiStatement({ rows: [
    { date: '2026-11-21', description: 'EVEREST ICES LONDON', paid_out: 60.19, paid_in: null },
    { date: '2026-11-22', description: 'CARD SALES', paid_out: null, paid_in: 250 }
  ] }));
  const parsed = parseStatementRows(table);
  assert.equal(parsed.error, undefined);
  assert.deepEqual(parsed.transactions.map(t => [t.date, t.amount, t.direction]), [['2026-11-21', 60.19, 'out'], ['2026-11-22', 250, 'in']]);
  const invoices = [{ id: 'inv-1', number: '52288', issuedOn: '2026-11-20', supplierName: 'EVEREST ICES ( LONDON ) LIMITED', net: 56.16, vat: 4.03, gross: 60.19, currency: 'GBP', state: 'confirmed' }];
  const [payment] = matchTransactions(parsed.transactions, invoices);
  assert.equal(payment.status, 'Matched');
  assert.equal(payment.invoice.id, 'inv-1');
});

const services = () => ({ auth: { config: { csrfSecret: 'a'.repeat(64) }, store: { consume: async () => ({ allowed: true, retryAfterSeconds: 0 }) } } });
const authorize = async () => ({ companyId: 'company-1', actorId: 'user-1' });
const jpeg = () => new File([new Uint8Array([255, 216, 255, 224, 0])], 'statement.jpg', { type: 'image/jpeg' });

test('route: kind=statement uses the statement reader and returns its rows', async () => {
  const form = new FormData(); form.append('page', jpeg()); form.append('kind', 'statement');
  const handler = invoiceExtractHandler(services(), { env: { GEMINI_API_KEY: 'test-key' }, authorize, log() {},
    extract: async () => assert.fail('the invoice reader must not be used'),
    extractStatement: async (pages) => { assert.equal(pages.length, 1); return { statement: { rows: [{ date: '2026-11-21', description: 'X', paid_out: 1, paid_in: null }] }, usage: {}, model: 'm' }; } });
  const response = await handler(new Request('http://localhost/api/business/invoice-extract', { method: 'POST', body: form })), body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.statement.rows.length, 1);
});
