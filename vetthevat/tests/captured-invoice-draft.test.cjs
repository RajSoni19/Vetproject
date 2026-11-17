const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const { draftLine, invoiceDraftFromText } = loadSource('lib/captured-invoice-draft');
const line = (extra) => ({ description: 'Synthetic item', quantity: 2, unitPrice: 14.5, netAmount: 29, vatRate: null, ...extra });

test('VAT treatment is mapped from evidence only; unknown VAT is never assumed', () => {
  assert.deepEqual(draftLine(line({ vatRate: null })), { description: 'Synthetic item', quantity: '2', unitPrice: '14.5', discount: '0', pricing: 'exclusive', printed: '29.00', rate: '0', treatment: 'not-evidenced' });
  assert.equal(draftLine(line({ vatRate: 20 })).treatment, 'standard');
  assert.equal(draftLine(line({ vatRate: 20 })).rate, '20');
  assert.equal(draftLine(line({ vatRate: 5 })).treatment, 'reduced');
  assert.deepEqual([draftLine(line({ vatRate: 0 })).treatment, draftLine(line({ vatRate: 0 })).rate], ['zero', '0']);
  assert.equal(draftLine(line({ vatRate: 0, taxClassification: 'Exempt' })).treatment, 'exempt');
  assert.equal(draftLine(line({ vatRate: 0, taxClassification: 'Out of scope' })).treatment, 'outside');
});

test('decimal strings stay within the API bounds', () => {
  const l = draftLine(line({ quantity: 1.123456, unitPrice: 0.33333333, vatRate: 20 }));
  assert.equal(l.quantity, '1.1235');
  assert.equal(l.unitPrice, '0.3333');
});

test('cash-and-carry text becomes a complete draft with the meeting example VAT number', () => {
  const text = [
    'TEMPLEGATE WINES CASH & CARRY LIMITED\tVAT Reg No: GB 795 6464 76',
    'SALES INVOICE\tInvoice No:\t448812', 'Customer:\tSynthetic Bistro\tDate:\t12/11/2026',
    'Code\tDescription\tQty\tPrice\tValue\tVAT',
    '10442\tLager 24x330ml\t6\t18.99\t113.94\tS', '30990\tBasmati Rice 20kg\t2\t24.00\t48.00\tZ',
    'Goods\t161.94', 'VAT\t22.79', 'Total\t184.73'
  ].join('\n');
  const draft = invoiceDraftFromText(text, 'scan.pdf', { companyName: 'Synthetic Bistro' });
  assert.equal(draft.supplierName, 'TEMPLEGATE WINES CASH & CARRY LIMITED');
  assert.equal(draft.supplierVatNumber, 'GB795646476');
  assert.equal(draft.number, '448812');
  assert.equal(draft.issuedOn, '2026-11-12');
  assert.deepEqual(draft.summary, { net: 161.94, vat: 22.79, gross: 184.73, customerName: 'Synthetic Bistro' });
  assert.deepEqual(draft.lines.map(l => [l.treatment, l.rate]), [['standard', '20'], ['zero', '0']]);
});

test('no line table: one line carries the net; an unrecognised VAT ratio stays not-evidenced', () => {
  const draft = invoiceDraftFromText('Supplier: Synthetic Ltd\nInvoice No: A-17\nDate: 01/11/2026\nSubtotal: 100.00\nVAT: 7.00\nTotal: 107.00', 'x.pdf');
  assert.equal(draft.lines.length, 1);
  assert.deepEqual([draft.lines[0].unitPrice, draft.lines[0].treatment, draft.lines[0].rate], ['100', 'not-evidenced', '0']);
  assert.ok(draft.warnings.some(w => /VAT not evidenced/.test(w)));
  const standard = invoiceDraftFromText('Supplier: Synthetic Ltd\nInvoice No: A-18\nDate: 01/11/2026\nSubtotal: 100.00\nVAT: 20.00\nTotal: 120.00', 'x.pdf');
  assert.deepEqual([standard.lines[0].treatment, standard.lines[0].rate], ['standard', '20']);
});

test('missing fields are listed for the person reviewing', () => {
  const draft = invoiceDraftFromText('Some unreadable scan text', 'x.jpg');
  assert.ok(draft.warnings.some(w => /invoice number/.test(w) && /invoice date/.test(w) && /gross total/.test(w)));
});
