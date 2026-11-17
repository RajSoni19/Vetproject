const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const { extractInvoiceFields, repairUkVat } = loadSource('lib/invoice-text-extraction');
const { invoiceDraftFromText } = loadSource('lib/captured-invoice-draft');
const T = '\t';

// The OCR reading of a real Lidl till receipt photo (thermal print): the item
// amounts, TOTAL, CARD, the 20% rate and one VAT code letter are all misread.
const lidlMain = [
  'oF' + T + 'LDL', 'LON- South Oxhey', 'VAT NO. GB350396897',
  'sweet Mixed Peppers 5 x £1.99' + T + '9 qr, i',
  'BN Peppers Mixed 3 Pack/7 x £1.75' + T + '12.725 A',
  'Heavy Duty Bag' + T + '0.65 A',
  '01AL' + T + 'ne BB', 'CARD' + T + '772.85',
  '*CUSTOMER CUPY# - PLEASE RETAIN RECEIPT', 'Date: 09/11/26' + T + 'Time: 15:46:45',
  'TRNS NO: UK172078297975313261', 'AMERICAN EXPRESS', 'kmount £22.85', 'APPROVED' + T + 'AUTH CODE 50',
  'VAT RATE' + T + 'SALES £' + T + 'VAT &', 'A 0%' + T + '22.20' + T + '0.00', 'B70 %' + T + '0.65' + T + '0.11',
  'Download the Lidl Plus app'
].join('\n');
const lidlSparse = ['TOTAL', '', '27.85', '', 'CARD', '', '22. 85', '', 'Amount £22.85'].join('\n');

test('a till receipt is read with cross-checked amounts, VAT codes and total', () => {
  const fields = extractInvoiceFields(lidlMain + '\n\f\n' + lidlSparse);
  assert.equal(fields.receipt, true);
  assert.equal(fields.supplierName, 'Lidl');
  assert.equal(fields.supplierVatNumber, 'GB350396892');
  assert.equal(fields.invoiceNumber, 'UK172078297975313261');
  assert.equal(fields.invoiceDate, '2026-11-09');
  assert.deepEqual([fields.net, fields.vat, fields.gross], [22.74, 0.11, 22.85]);
  assert.deepEqual(fields.lines.map(l => [l.description, l.quantity, l.unitPrice, l.netAmount, l.vatRate, l.inclusive]), [
    ['Sweet Mixed Peppers', 5, 1.99, 9.95, 0, true],
    ['Peppers Mixed 3 Pack', 7, 1.75, 12.25, 0, true],
    ['Heavy Duty Bag', 1, 0.65, 0.65, 20, true]
  ]);
  assert.ok(fields.notes.some(n => /corrected to 350396892/.test(n)));
});

test('browser misreads: lost quantity, unreadable amount, spaced decimal, unreadable TOTAL/CARD', () => {
  const main = [
    'LeDL', 'LON- South Oxhey', 'VAT NO. GB350396897',
    'sweet Mixed Peppers 5 x £1.99' + T + '9 9 i',
    'Peppers Mixed 3 Pack’ x £1.75' + T + '172.725 A',
    'Heavy Duty Bag' + T + '0 65 PB',
    'TOTAL' + T + 'y L', 'CARD' + T + '“os', 'CUSTOMER COPY* - PLEASE RETAIN RECEIPT', 'Date: 09/11/26',
    'Amount £22.85', 'VAT RATE' + T + 'SALES £' + T + 'VAT &', 'A 0%' + T + '22.20' + T + '0.00', 'B70 %' + T + '0.65' + T + '0.11'
  ].join('\n');
  const fields = extractInvoiceFields(main + '\n\f\nAmount £22.85');
  assert.deepEqual([fields.gross, fields.vat], [22.85, 0.11]);
  assert.deepEqual(fields.lines.map(l => [l.quantity, l.unitPrice, l.netAmount, l.vatRate]), [[5, 1.99, 9.95, 0], [7, 1.75, 12.25, 0], [1, 0.65, 0.65, 20]]);
  assert.ok(fields.notes.some(n => /worked out from the receipt total/.test(n)));
});

test('quantity-first receipt with offer prices (Tesco layout) and OCR junk at the left edge', () => {
  const text = [
    'TESCO', 'Watford Extra', 'VAT Number: GB 220 4302 31',
    'oN' + T + 'S Captain Morgan Mid Strength Spirit £30 Of', 'Drink 70c)', 'BE' + T + '£15.00 eac!', '\\' + T + 'Ce £12.00' + T + '£6.00',
    '3 Baileys Original Irish Cream' + T + '£68.25', '€' + T + 'Liqueur Bottle 17% Vol 1l', 'a' + T + '£22.75 each' + T + 'oo', '4' + T + 'Ce £10.00' + T + '£38.25',
    '~~4 6 Nightingale Farms peppers 375g' + T + '£10.50', '-—' + T + '£1.75 each',
    '‘8 1 Tesco Persimmons Minimum 2 Pack' + T + '£1.70', 'Cc £1.20' + T + '-£0.90',
    '{ Tesco Bananas Loose' + T + '£0.91',
    'Subtotal :' + T + '£142.16', 'Savings:' + T + '-£47.75', 'x' + T + 'TOTAL:' + T + '£84.61', '9' + T + 'Card' + T + '£84.61', 'Clubcard points earned:' + T + '84', 'Amex'
  ].join('\n');
  const fields = extractInvoiceFields(text);
  assert.equal(fields.receipt, true);
  assert.equal(fields.supplierName, 'Tesco');
  assert.equal(fields.gross, 84.61);
  assert.deepEqual(fields.lines.map(l => [l.quantity, l.unitPrice, l.discount ?? 0, l.netAmount]), [[2, 15, 6, 24], [3, 22.75, 38.25, 30], [6, 1.75, 0, 10.5], [1, 1.7, 0.5, 1.2], [1, 0.91, 0, 0.91]]);
  assert.match(fields.lines[0].description, /^Captain Morgan Mid Strength Spirit Drink/);
  assert.ok(fields.lines.every(l => l.vatRate === null)); // Tesco prints no VAT analysis
  const draft = invoiceDraftFromText(text, 'tesco.jpg');
  assert.deepEqual([draft.lines[0].discount, draft.lines[0].printed], ['6', '24.00']);
});

test('receipt with a code-less VAT summary, wrapped descriptions and dropped decimal points', () => {
  const text = [
    'POPAT STORIE (uk) LTD', '138 Ealing Road', 'VAT No 141 399 18', 'Popat Till', 'gales Receipt',
    'SCM SS SINK STRAINER', 'PCS STAINLESS STEEL SINK' + T + '£100', 'STRAINER', '11 5CM SS SINK STRAINER' + T + '£1.99',
    'PREMIER PRESSURE' + T + '£48 00', 'COOKER ALU 12L', 'SPECIAL OFFER ITEM £2.09' + T + '£2.99',
    'Number of ems' + T + '1%', 'SubTotal' + T + '£55.48', 'card' + T + '1' + T + '£55.48',
    'VAT%' + T + 'Total' + T + 'VAT Value', '20.00' + T + '55.48' + T + '925',
    'Sales Order: 26286868', '29/10/2026 0553', 'Visit Us Online www; popatstores. co uk'
  ].join('\n');
  const fields = extractInvoiceFields(text);
  assert.equal(fields.supplierName, 'POPAT STORES (UK) LTD');
  assert.equal(fields.supplierVatNumber, '');
  assert.equal(fields.invoiceNumber, '26286868');
  assert.equal(fields.invoiceDate, '2026-10-29');
  assert.deepEqual([fields.gross, fields.vat, fields.net], [55.48, 9.25, 46.23]);
  assert.deepEqual(fields.lines.map(l => [l.description, l.netAmount, l.vatRate]), [
    ['SCM SS SINK STRAINER', 1.5, 20], ['PCS STAINLESS STEEL SINK STRAINER', 1, 20], ['11 5CM SS SINK STRAINER', 1.99, 20],
    ['PREMIER PRESSURE COOKER ALU 12L', 48, 20], ['SPECIAL OFFER ITEM £2.09', 2.99, 20]
  ]);
});

test('receipt lines become VAT-inclusive draft lines with the printed amount', () => {
  const draft = invoiceDraftFromText(lidlMain + '\n\f\n' + lidlSparse, 'receipt.jpg');
  assert.equal(draft.receipt, true);
  assert.deepEqual(draft.lines.map(l => [l.pricing, l.treatment, l.rate, l.printed]), [
    ['inclusive', 'zero', '0', '9.95'], ['inclusive', 'zero', '0', '12.25'], ['inclusive', 'standard', '20', '0.65']
  ]);
});

test('a receipt without a VAT table leaves VAT not evidenced', () => {
  const text = ['CORNER SHOP', 'Milk 2 x £1.20' + T + '2.40', 'Bread' + T + '1.10', 'TOTAL' + T + '3.50', 'CASH' + T + '5.00', 'CHANGE' + T + '1.50', 'Thank you - please retain receipt'].join('\n');
  const fields = extractInvoiceFields(text);
  assert.equal(fields.receipt, true);
  assert.equal(fields.gross, 3.5);
  assert.equal(fields.vat, null);
  assert.ok(fields.lines.every(l => l.vatRate === null));
});

test('a chosen supplier replaces the supplier read from the document', () => {
  const draft = invoiceDraftFromText(lidlMain + '\n\f\n' + lidlSparse, 'receipt.jpg', { supplier: { id: 'sup-1', name: 'Lidl Great Britain Limited', vatNumber: 'GB350396892' } });
  assert.deepEqual([draft.supplierId, draft.supplierName, draft.supplierVatNumber], ['sup-1', 'Lidl Great Britain Limited', 'GB350396892']);
  assert.ok(!draft.warnings.some(w => /^VAT number/.test(w)));
});

test('VAT number repair only applies a unique single-digit lookalike fix', () => {
  assert.equal(repairUkVat('350396897'), '350396892');
  assert.equal(repairUkVat('350396892'), null);
});

test('5 misread as S before a unit is corrected in descriptions', () => {
  const draft = invoiceDraftFromText(['Supplier Foods Ltd', 'Invoice No: 77', 'Invoice date: 17/11/2026', 'Description' + T + 'Qty' + T + 'Rate' + T + 'Amount', 'Greek style yogurt Skg' + T + '6' + T + '£12.00' + T + '£72.00', 'Total' + T + '£72.00'].join('\n'), 'x.jpg');
  assert.equal(draft.lines[0].description, 'Greek style yogurt 5kg');
});
