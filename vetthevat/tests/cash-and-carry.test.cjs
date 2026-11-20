const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const { readCashAndCarry } = loadSource('lib/cash-and-carry-extraction');
const { extractInvoiceFields } = loadSource('lib/invoice-text-extraction');

// Synthetic text in the layout PDF.js produces for a Booker invoice (tabs between columns).
const page1 = [
  'BRANCH 999\tTESTTOWN',
  'Booker is the trading name of Booker Limited\tAB1 2CD TEL : 01000 000000',
  'Registered in England, Number 197380, VAT Number GB 220 4302 31',
  '**COPY**COPY**COPY**COPY**\tINVOICE NUMBER 0123456\tPAGE 01',
  'CUSTOMER 100000001',
  'SAMPLE CATERING LTD 1 TEST ROAD\tDATE 20/01/26\tTIME 17:03',
  'STD',
  'CODE\tDESCRIPTION\tPACK SIZE\tQTY\tPRICE\tVALUE\tVAT\tRRP POR',
  '297345 Oreo Double Cream PM129\t16 157g\t1\t14.45\t14.45\tA\t1.29 30.0%',
  '298888 Pepsi Regular NRB\t1 12x330m\t1\t7.95\t7.95\tB',
  '314471 Coca Cola Diet\t1 24/200m\t1\t15.19\t15.19\tB',
  'VOID NOTE',
  '*314471 Coca Cola Diet\t1 24/200m\t1-\t15.19\t15.19- B',
  '245105 Flying Goose Sriracha Mayo\t6 455ml\t2\t15.99\t31.98\tA',
  '195253 CL Vanilla Ice Cream\t1 4ltr\t2\t4.99 P\t9.98\tB',
  '-----\t---------',
  'FROZEN FOOD\tSUB-TOTAL\t:\tITEMS\t3\tGOODS :\t28.97 EXC.VAT',
  '/CONT'
].join('\n');
const page2 = [
  '**COPY**COPY**COPY**COPY**\tINVOICE NUMBER 0123456\tPAGE 02',
  'TOTAL ITEMS: 6',
  'RATE\tGOODS\tMULT\tNETT\tVAT\tTOTALS: GOODS\t64.36\t:CASH\t0.00',
  'A: 0.00\t46.43\t0.00\t46.43\t0.00\tVAT\t3.59\t:CREDIT\t0.00',
  'B:20.00\t17.93\t0.00\t17.93\t3.59\t---------\t:CHQ B\t0.00',
  'INVOICE TOTAL\t67.95\t:CHQ P\t0.00',
  'GRAND TOTAL\t67.95\t:R/COUP\t0.00'
].join('\n');

test('cash-and-carry: VAT codes from the VAT table, quantities kept, voided item removed', () => {
  const reading = readCashAndCarry(page1 + '\n' + page2);
  assert.ok(reading);
  assert.deepEqual(reading.lines.map(l => [l.description, l.quantity, l.unitPrice, l.netAmount, l.vatRate]), [
    ['Oreo Double Cream PM129 (16 x 157g)', 1, 14.45, 14.45, 0],
    ['Pepsi Regular NRB (1 x 12x330m)', 1, 7.95, 7.95, 20],
    ['Flying Goose Sriracha Mayo (6 x 455ml)', 2, 15.99, 31.98, 0],
    ['CL Vanilla Ice Cream (1 x 4ltr)', 2, 4.99, 9.98, 20]
  ]);
  assert.equal(reading.goods, 64.36);
  assert.equal(reading.vat, 3.59);
  assert.equal(reading.gross, 67.95);
  assert.ok(reading.notes.some(note => /Coca Cola Diet/.test(note)));
});

test('cash-and-carry: not used when the items do not add up to the printed goods total', () => {
  assert.equal(readCashAndCarry(page1.replace('7.95\t7.95', '7.95\t8.95') + '\n' + page2), null);
  assert.equal(readCashAndCarry('Some other invoice\nTotal 10.00'), null);
});

test('Booker invoice read end to end: supplier, prices exclude VAT, zero-rated and standard lines', () => {
  const fields = extractInvoiceFields(page1 + '\n' + page2, { companyName: 'Sample Catering Ltd' });
  assert.equal(fields.supplierName, 'Booker');
  assert.equal(fields.supplierVatNumber, 'GB220430231');
  assert.equal(fields.invoiceNumber, '0123456');
  assert.equal(fields.receipt, undefined);
  assert.equal(fields.lines.length, 4);
  assert.ok(fields.lines.every(line => !line.inclusive));
  assert.deepEqual(fields.lines.map(l => l.taxClassification), ['Zero-rated', 'Taxable', 'Zero-rated', 'Taxable']);
  assert.deepEqual([fields.net, fields.vat, fields.gross], [64.36, 3.59, 67.95]);
  assert.equal(fields.vatNeedsReview, false);
});
