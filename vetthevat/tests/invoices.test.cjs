const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const money = loadSource('lib/money');
const vat = loadSource('lib/vat-calculations');
const rules = loadSource('lib/invoice-rules');
const { filterInvoices } = loadSource('lib/invoice-filters');
const { validateDocumentSignature } = loadSource('lib/document-validation');
const { matchDocumentAmount, parseDocumentMoney } = loadSource('lib/invoice-parsing');
const { browserInvoiceProcessingService: processor } = loadSource('lib/services');
const company = { id: 'synthetic-company', name: 'Synthetic Test Company', vatNumber: '', currency: 'GBP' };
const line = (price, rate, extra = {}) => vat.calculateLine({ description: 'Synthetic item', quantity: 1, unitPrice: price, discount: 0, vatRate: rate, ...extra });
function validInvoice() {
  const invoice = rules.createInvoiceDraft(company);
  const lineItems = [line(100, 20)];
  return { ...invoice, supplierName: 'Synthetic Supplier', supplierId: 'synthetic-supplier', invoiceNumber: 'TEST-123', invoiceDate: '2026-10-14', lineItems, ...vat.calculateInvoiceTotals(lineItems), vatBreakdown: vat.buildVATBreakdown(lineItems) };
}
const document = textContent => ({ id: 'synthetic-document', fileName: 'test-invoice.pdf', textContent });

test('decimal half-up avoids binary rounding and retains fractional prices', () => {
  assert.equal(money.toMinorUnits(1.005), 101);
  assert.equal(money.toMinorUnits(-1.005), -101);
  assert.equal(line(0.3333, 20, { quantity: 3 }).netAmount, 1);
  assert.equal(line(10.125, 20, { quantity: 2, discount: 0.25 }).netAmount, 20);
  assert.equal(line(10.125, 20, { quantity: 2, discount: 0.25 }).vatAmount, 4);
});
test('mixed 0/5/20 VAT totals reconcile without collapsing repeated lines', () => {
  const items = [line(100, 0), line(100, 5), line(100, 20), line(100, 20)];
  assert.deepEqual(vat.calculateInvoiceTotals(items), { subtotal: 400, vatAmount: 45, totalAmount: 445 });
  assert.equal(vat.buildVATBreakdown(items).length, 3);
});
test('calendar validation rejects rollover and accepts leap days/named dates', () => {
  for (const date of ['31/02/2026', '2026-02-29', '2026-13-01', 'garbage']) assert.equal(rules.parseInvoiceDate(date), null);
  assert.equal(rules.parseInvoiceDate('29/02/2024'), '2024-02-29');
  assert.equal(rules.parseInvoiceDate('14 October 2026'), '2026-10-14');
});
test('company/supplier duplicate rules exclude the current record', () => {
  const invoice = validInvoice();
  assert.equal(rules.findDuplicateInvoice(invoice, [invoice]), undefined);
  assert.ok(rules.findDuplicateInvoice(invoice, [{ ...invoice, id: 'other', invoiceNumber: ' test-123 ' }]));
  assert.equal(rules.findDuplicateInvoice(invoice, [{ ...invoice, id: 'other', companyId: 'other-company' }]), undefined);
  assert.equal(rules.findDuplicateInvoice(invoice, [{ ...invoice, id: 'other', supplierId: 'different', supplierName: 'Different Supplier' }]), undefined);
});
test('idempotent local upsert and JSON roundtrip preserve drafts', () => {
  const draft = rules.createInvoiceDraft(company);
  const saved = rules.upsertInvoice(rules.upsertInvoice([], draft), { ...draft, notes: 'Edited draft' });
  assert.equal(saved.length, 1);
  assert.equal(JSON.parse(JSON.stringify(saved))[0].notes, 'Edited draft');
  assert.throws(() => rules.upsertInvoice(saved, { ...draft, companyId: 'different' }));
});
test('verification rejects header/line mismatch, invalid numeric values and duplicates', () => {
  const invoice = validInvoice();
  assert.deepEqual(rules.validateInvoice(invoice), []);
  assert.ok(rules.validateInvoice({ ...invoice, subtotal: 99 }).some(error => /line totals/.test(error)));
  assert.ok(rules.validateInvoice({ ...invoice, lineItems: [{ ...invoice.lineItems[0], quantity: -1 }] }).length);
  assert.ok(rules.validateInvoice({ ...invoice, lineItems: [{ ...invoice.lineItems[0], unitPrice: Infinity }] }).length);
  assert.ok(rules.validateInvoice({ ...invoice, dueDate: '2026-10-01' }).length);
  assert.ok(rules.validateInvoice(invoice, [{ ...invoice, id: 'duplicate' }]).length);
});
test('parser uses actual text, retains explicit zero and identical rows', async () => {
  const text = 'Supplier: Synthetic Supplier\nInvoice Number: TEST-789\nInvoice Date: 14/10/2026\nSubtotal: 100.00\nVAT: 0.00\nTotal: 100.00\nRepeated item 1 50.00 0% 50.00\nRepeated item 1 50.00 0% 50.00';
  const invoice = await processor.processInvoice(document(text), company, []);
  assert.equal(invoice.supplierName, 'Synthetic Supplier');
  assert.equal(invoice.invoiceNumber, 'TEST-789');
  assert.equal(invoice.invoiceDate, '2026-10-14');
  assert.equal(invoice.lineItems.length, 2);
  assert.equal(invoice.lineItems[0].vatRate, 0);
  assert.equal(invoice.vatAmount, 0);
  assert.deepEqual(rules.validateInvoice(invoice), []);
});
test('unreadable text leaves financial identity fields missing', async () => {
  const invoice = await processor.processInvoice(document(''), company, []);
  assert.equal(invoice.supplierName, ''); assert.equal(invoice.invoiceNumber, ''); assert.equal(invoice.invoiceDate, '');
  assert.equal(invoice.totalAmount, 0); assert.equal(invoice.vatRateNeedsReview, true);
  assert.ok(rules.validateInvoice(invoice).length);
});
test('amount parsing preserves negatives, locale separators and rejects malformed amounts', () => {
  assert.equal(matchDocumentAmount('Subtotal: -100.00', 'subtotal'), -100);
  assert.equal(matchDocumentAmount('Total: (100.00)', 'total'), -100);
  assert.equal(parseDocumentMoney('1.234,56'), 1234.56);
  assert.equal(parseDocumentMoney('1,234.56'), 1234.56);
  assert.equal(parseDocumentMoney('1.2.3'), null);
  assert.equal(matchDocumentAmount('VAT number: GB123456789\nVAT: 20.00', 'vat'), 20);
  assert.equal(matchDocumentAmount('VAT 20%', 'vat'), null);
  assert.equal(matchDocumentAmount('VAT: 0 %', 'vat'), null);
  assert.equal(matchDocumentAmount('VAT 20% 10.00', 'vat'), 10);
  assert.equal(matchDocumentAmount('VAT 20%\nVAT amount: 10.00', 'vat amount|vat'), 10);
});

test('rate-only text leaves the VAT amount unknown and requires review', async () => {
  const invoice = await processor.processInvoice(document('Supplier: Synthetic Supplier\nInvoice Number: RATE-ONLY\nInvoice Date: 14/10/2026\nSubtotal: 50.00\nVAT 20%\nTotal: 60.00'), company, []);
  assert.equal(invoice.sourceTotals.vatAmount, null);
  assert.equal(invoice.vatRateNeedsReview, true);
  assert.ok(rules.validateInvoice(invoice).length);
});

test('original association cannot be silently reassigned or cross company', () => {
  const invoice = {...validInvoice(),documentId:'synthetic-original'};
  const original = {id:invoice.documentId,companyId:invoice.companyId,associatedInvoiceId:invoice.id};
  assert.doesNotThrow(()=>rules.validateInvoiceDocument(invoice,[original],[invoice]));
  assert.throws(()=>rules.validateInvoiceDocument({...invoice,id:'new-record'},[original],[invoice]));
  assert.throws(()=>rules.validateInvoiceDocument(invoice,[{...original,companyId:'other'}],[]));
  assert.throws(()=>rules.validateInvoiceDocument(invoice,[],[]));
});
test('list filters isolate company, include date boundaries and match filenames', () => {
  const invoice = { ...validInvoice(), status: 'Reviewed', documentId: 'file' };
  const other = { ...invoice, id: 'other', companyId: 'other-company' };
  const filters = { companyId: company.id, status: 'Reviewed', currency: 'GBP', dateFrom: '2026-10-14', dateTo: '2026-10-14', query: 'synthetic.pdf' };
  assert.deepEqual(filterInvoices([invoice, other], filters, [{ id: 'file', fileName: 'synthetic.pdf' }]), [invoice]);
  assert.deepEqual(filterInvoices([invoice], { ...filters, dateFrom: '2026-11-01' }), []);
});
test('upload signatures reject spoofed/empty/oversized/unsupported files', () => {
  validateDocumentSignature('application/pdf', 500, Buffer.from('%PDF-1.7'));
  validateDocumentSignature('image/jpeg', 500, Uint8Array.from([255,216,255]));
  validateDocumentSignature('image/png', 500, Uint8Array.from([137,80,78,71,13,10,26,10]));
  validateDocumentSignature('image/webp', 500, Buffer.from('RIFF1234WEBP'));
  assert.throws(() => validateDocumentSignature('application/pdf', 500, Buffer.from('not pdf')));
  assert.throws(() => validateDocumentSignature('image/png', 0, new Uint8Array()));
  assert.throws(() => validateDocumentSignature('image/png', 11*1024*1024, new Uint8Array()));
  assert.throws(() => validateDocumentSignature('text/plain', 20, Buffer.from('text')));
});
