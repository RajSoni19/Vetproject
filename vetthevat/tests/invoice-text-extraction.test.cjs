const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const { extractInvoiceFields, parseFlexibleDate } = loadSource('lib/invoice-text-extraction');
const { layoutPositionedText, normalizeDocumentText, mergeImageOcr, pdfTextNeedsImageOcr } = loadSource('lib/document-text-layout');
const { browserInvoiceProcessingService: processor, detectSupportedDocumentKind } = loadSource('lib/services');
const rules = loadSource('lib/invoice-rules');

// All parties, numbers and amounts below are synthetic.
const company = { id: 'synthetic-company', name: 'Synthetic Bistro', vatNumber: '', currency: 'GBP' };
const doc = textContent => ({ id: 'synthetic-document', fileName: 'scan.pdf', textContent });
const T = '\t';
// A VAT number that passes the HMRC modulus-97 check, built rather than copied.
function ukVat(first7) {
  const sum = [8, 7, 6, 5, 4, 3, 2].reduce((total, weight, index) => total + weight * Number(first7[index]), 0);
  let check = 97 - (sum % 97); if (check === 97) check = 0;
  return first7 + String(check).padStart(2, '0');
}
const VAT = ukVat('7956464');
const rows = lines => lines.map(line => Array.isArray(line) ? line.join(T) : line).join('\n');
const lineSummary = line => [line.description, line.quantity, line.unitPrice, line.netAmount, line.vatRate];

const scannedZeroVat = rows([
  ['R K', 'RIVERSIDE PRODUCE LIMITED'],
  ['FRUITS & VEGETABLES', 'United Kingdom'],
  'orders@riverside.example',
  'INVOICE',
  ['Bill To', 'Invoice#', 'INV-000110'],
  ['Synthetic Bistro', 'Invoice Date', '26/10/2026'],
  ['188-190 Example Rd', 'Terms', 'Due on Receipt'],
  ['Harrow HA0 0AA', 'Due Date', '26/10/2026'],
  ['# Item', 'Description', 'Qty', 'Rate', 'Amount'],
  ['1 Red onion 10kg', '1.00', '12.00', '12.00'],
  ['2 Onions -20kg', '1.00', '15.00', '15.00'],
  ['3 Spinach (PALAK)', '2.00', '14.50', '29.00'],
  ['4 Aubergine 400', '2.00', '11.50', '23.00'],
  ['HSBC Business account', 'Sub Total', '79.00'],
  ['Name: Riverside Produce Limited', 'Total', '£79.00'],
  'Short Code: 40 - 42 - 14',
  ['Account Number: 00000000', 'Balance Due', '£79.00'],
  'Visit example.com/invoice to create truly professional invoices'
]);

test('scanned two-column invoice: every header field, all lines, no VAT charged', () => {
  const fields = extractInvoiceFields(scannedZeroVat, { companyName: company.name });
  assert.equal(fields.supplierName, 'RIVERSIDE PRODUCE LIMITED');
  assert.equal(fields.customerName, 'Synthetic Bistro');
  assert.equal(fields.invoiceNumber, 'INV-000110');
  assert.equal(fields.invoiceDate, '2026-10-26');
  assert.equal(fields.dueDate, '2026-10-26');
  assert.equal(fields.currency, 'GBP');
  assert.deepEqual(fields.read, { net: 79, vat: null, gross: 79 });
  assert.equal(fields.vat, 0);
  assert.deepEqual(fields.lines.map(lineSummary), [
    ['Red onion 10kg', 1, 12, 12, 0], ['Onions -20kg', 1, 15, 15, 0], ['Spinach (PALAK)', 2, 14.5, 29, 0], ['Aubergine 400', 2, 11.5, 23, 0]
  ]);
  assert.equal(fields.vatNeedsReview, false);
  assert.deepEqual(fields.notes, []);
});

test('scanned invoice becomes a record that validates without manual edits', async () => {
  const invoice = await processor.processInvoice(doc(scannedZeroVat), company, []);
  assert.deepEqual(invoice.warnings, []);
  assert.deepEqual(rules.validateInvoice(invoice), []);
  assert.equal(invoice.totalAmount, 79);
});

test('columns merged by single spaces still separate the customer from the invoice labels', () => {
  const merged = scannedZeroVat.replace(/\t/g, ' ');
  const fields = extractInvoiceFields(merged, { companyName: company.name });
  assert.equal(fields.customerName, 'Synthetic Bistro');
  assert.equal(fields.supplierName, 'RIVERSIDE PRODUCE LIMITED');
  assert.equal(fields.invoiceNumber, 'INV-000110');
  assert.equal(fields.invoiceDate, '2026-10-26');
  assert.equal(fields.read.net, 79);
  assert.equal(fields.lines.length, 4);
});

test('low-resolution OCR damage is repaired only where the arithmetic proves it', () => {
  const damaged = rows([
    ['RIVERSIDE PRODUCE LIMITED'],
    ['Bil To', 'Invoices', 'INV-000110'],
    ['Synthetic Bistro', 'Invoice Date', '26102026'],
    ['Harrow', 'Due Date.', '2611012026'],
    ['* item', 'Description', 'Qty Rate', 'Amount'],
    ['1 Red onion 10kg', '1.00 1200', '1200'],
    ['2 Onions -20kg', '100 15.00', '15.00'],
    ['3 Spinach (PALAK)', '200', '1450', '29.00'],
    ['4 Aubergine 400', '2.00', '11.50', '23,00'],
    ['Bank account', 'Sub Total', '7900'],
    ['Name: Riverside Produce Limited', 'Total', '£7900'],
    ['Account Number: 00000000', 'Balance Due', '£79.00']
  ]);
  const fields = extractInvoiceFields(damaged, { companyName: company.name });
  assert.equal(fields.invoiceNumber, 'INV-000110');
  assert.equal(fields.invoiceDate, '2026-10-26');
  assert.equal(fields.dueDate, '2026-10-26');
  assert.equal(fields.customerName, 'Synthetic Bistro');
  assert.deepEqual(fields.lines.map(lineSummary), [
    ['Red onion 10kg', 1, 12, 12, 0], ['Onions -20kg', 1, 15, 15, 0], ['Spinach (PALAK)', 2, 14.5, 29, 0], ['Aubergine 400', 2, 11.5, 23, 0]
  ]);
  assert.deepEqual(fields.read, { net: 79, vat: null, gross: 79 });
  assert.equal(fields.notes.length, 1);
  assert.match(fields.notes[0], /decimal point/);
});

test('cash and carry invoice: goods, VAT and total, VAT number, per-line VAT codes', async () => {
  const text = rows([
    'TEMPLEGATE',
    'Wines Cash & Carry',
    ['Unit 4 Example Trading Estate, London', `VAT Reg No: GB ${VAT.slice(0, 3)} ${VAT.slice(3, 7)} ${VAT.slice(7)}`],
    ['INVOICE', 'Invoice No: 448812'],
    ['Customer: Synthetic Bistro', 'Date: 12/11/2026'],
    ['Code', 'Description', 'Qty', 'Price', 'Value', 'VAT'],
    ['10442', 'Lager 24x330ml', '6', '18.99', '113.94', 'S'],
    ['20871', 'House Red 75cl x6', '4', '36.50', '146.00', 'S'],
    ['30015', 'Sparkling Water 24x500ml', '8', '6.24', '49.92', 'S'],
    ['30990', 'Basmati Rice 20kg', '2', '24.00', '48.00', 'Z'],
    ['41200', 'Cooking Oil 20L', '3', '27.50', '82.50', 'Z'],
    ['50031', 'Blue Roll 6pk', '5', '17.02', '85.10', 'S'],
    ['Goods', '525.46'],
    ['VAT', '78.99'],
    ['Total', '604.45'],
    'Account Name: Templegate Wines Cash & Carry Limited',
    'Sort Code: 00-00-00  Account No: 00000000',
    'Please quote invoice number 448812 when paying'
  ]);
  const fields = extractInvoiceFields(text, { companyName: company.name });
  assert.deepEqual(fields.read, { net: 525.46, vat: 78.99, gross: 604.45 });
  assert.equal(fields.supplierVatNumber, `GB${VAT}`);
  assert.equal(fields.supplierName, 'Templegate Wines Cash & Carry Limited');
  assert.equal(fields.customerName, 'Synthetic Bistro');
  assert.equal(fields.invoiceNumber, '448812');
  assert.equal(fields.invoiceDate, '2026-11-12');
  assert.equal(fields.lines.length, 6);
  assert.deepEqual(fields.lines.map(line => line.vatRate), [20, 20, 20, 0, 0, 20]);
  assert.equal(fields.lines[3].taxClassification, 'Zero-rated');
  assert.equal(fields.lines[0].description, '10442 Lager 24x330ml');
  assert.equal(fields.vatNeedsReview, false);
  assert.deepEqual(fields.notes, []);
  assert.equal(detectSupportedDocumentKind('scan.pdf', text), 'invoice');
  const invoice = await processor.processInvoice(doc(text), company, []);
  assert.equal(invoice.vatAmount, 78.99);
  assert.equal(invoice.subtotal, 525.46);
  assert.equal(invoice.totalAmount, 604.45);
  assert.deepEqual(rules.validateInvoice(invoice), []);
});

test('accounting-package layout: thousands separators, named dates, single standard rate', () => {
  const text = rows([
    ['TAX INVOICE', 'Northbank Building Supplies Ltd'],
    ['Synthetic Bistro', 'Invoice Date', '13 Nov 2026'],
    ['Attention: Accounts', 'Invoice Number', 'INV-0042'],
    ['', 'Reference', 'PO-7781'],
    ['', 'VAT Number', VAT],
    ['Description', 'Quantity', 'Unit Price', 'VAT', 'Amount GBP'],
    ['Structural timber beam 4.8m', '10.00', '85.00', '20%', '850.00'],
    ['Delivery and offloading', '1.00', '400.00', '20%', '400.00'],
    ['Subtotal', '1,250.00'],
    ['TOTAL VAT 20%', '250.00'],
    ['TOTAL GBP', '1,500.00'],
    ['Due Date: 13 Dec 2026']
  ]);
  const fields = extractInvoiceFields(text, { companyName: company.name });
  assert.equal(fields.supplierName, 'Northbank Building Supplies Ltd');
  assert.equal(fields.supplierVatNumber, VAT);
  assert.equal(fields.invoiceNumber, 'INV-0042');
  assert.equal(fields.invoiceDate, '2026-11-13');
  assert.equal(fields.dueDate, '2026-12-13');
  assert.deepEqual(fields.read, { net: 1250, vat: 250, gross: 1500 });
  assert.deepEqual(fields.lines.map(lineSummary), [['Structural timber beam 4.8m', 10, 85, 850, 20], ['Delivery and offloading', 1, 400, 400, 20]]);
  assert.equal(fields.vatNeedsReview, false);
});

test('labels on one row with the values underneath', () => {
  const text = rows([
    'Harbour Office Supplies',
    '12 Example Quay, Leeds',
    ['INVOICE #', 'DATE', 'DUE DATE', 'TERMS'],
    ['1001', '13/11/2026', '13/12/2026', 'Net 30'],
    ['BILL TO'],
    ['Synthetic Bistro'],
    ['ACTIVITY', 'QTY', 'RATE', 'AMOUNT'],
    ['Copier paper A4 box', '4', '22.50', '90.00'],
    ['Toner cartridge', '1', '60.00', '60.00'],
    ['SUBTOTAL', '150.00'],
    ['VAT @ 20%', '30.00'],
    ['TOTAL', '180.00'],
    ['BALANCE DUE', '£180.00']
  ]);
  const fields = extractInvoiceFields(text, { companyName: company.name });
  assert.equal(fields.invoiceNumber, '1001');
  assert.equal(fields.invoiceDate, '2026-11-13');
  assert.equal(fields.dueDate, '2026-12-13');
  assert.equal(fields.supplierName, 'Harbour Office Supplies');
  assert.equal(fields.customerName, 'Synthetic Bistro');
  assert.deepEqual(fields.read, { net: 150, vat: 30, gross: 180 });
  // No VAT column on the lines: the single 20% rate is evidenced by the totals.
  assert.deepEqual(fields.lines.map(line => line.vatRate), [20, 20]);
  assert.equal(fields.vatNeedsReview, false);
});

test('"Net 30" payment terms and a VAT registration number are not amounts', () => {
  const fields = extractInvoiceFields(`Supplier: Synthetic Supplier\nTerms: Net 30\nVAT Reg No 123 4567 89\nTax Point: 12.11.2026\nTotal: 60.00`);
  assert.deepEqual(fields.read, { net: null, vat: null, gross: 60 });
  assert.equal(fields.invoiceDate, '2026-11-12');
});

test('separate VAT rows per rate are added together', () => {
  const fields = extractInvoiceFields(rows([['Net Total', '300.00'], ['VAT @ 20%', '40.00'], ['VAT @ 5%', '5.00'], ['Total Due', '345.00']]));
  assert.deepEqual(fields.read, { net: 300, vat: 45, gross: 345 });
});

test('VAT summary table supplies the totals when no labelled rows exist', () => {
  const fields = extractInvoiceFields(rows([['VAT Rate', 'Net', 'VAT', 'Gross'], ['20%', '100.00', '20.00', '120.00'], ['0%', '50.00', '0.00', '50.00']]));
  assert.deepEqual(fields.read, { net: 150, vat: 20, gross: 170 });
});

test('mixed-rate invoice without line codes is left for review, never guessed', async () => {
  const text = rows([
    'Supplier: Synthetic Wholesale Ltd', 'Invoice No: MX-1', 'Invoice Date: 01/11/2026',
    ['Description', 'Qty', 'Price', 'Amount'],
    ['Rice 20kg', '2', '25.00', '50.00'],
    ['Cleaning spray', '10', '5.00', '50.00'],
    ['Subtotal', '100.00'], ['VAT', '10.00'], ['Total', '110.00']
  ]);
  const fields = extractInvoiceFields(text);
  assert.deepEqual(fields.lines.map(line => line.vatRate), [null, null]);
  assert.equal(fields.vatNeedsReview, true);
  const invoice = await processor.processInvoice(doc(text), company, []);
  assert.equal(invoice.vatRateNeedsReview, true);
  assert.equal(invoice.vatAmount, 10);
  assert.ok(rules.validateInvoice(invoice).some(error => /VAT treatment/.test(error)));
});

test('a customer VAT number is not taken as the supplier VAT number', () => {
  const customerVat = ukVat('1234567');
  const text = rows([
    'Synthetic Wholesale Ltd', `VAT No: ${VAT}`,
    'Invoice To:', 'Synthetic Bistro', `Customer VAT No: GB${customerVat}`,
    'Invoice No: 77', 'Total: 12.00'
  ]);
  const fields = extractInvoiceFields(text, { companyName: company.name });
  assert.equal(fields.supplierVatNumber, VAT);
  assert.equal(fields.customerVatNumber, `GB${customerVat}`);
  const own = extractInvoiceFields(`Synthetic Wholesale Ltd\nVAT No: ${VAT}\nInvoice No: 77`, { companyName: company.name, companyVatNumber: `GB ${VAT}` });
  assert.equal(own.supplierVatNumber, '');
  assert.equal(own.customerVatNumber, VAT);
});

test('a VAT number that fails the check digit is kept but flagged', () => {
  const bad = VAT.slice(0, 7) + String((Number(VAT.slice(7)) + 1) % 100).padStart(2, '0');
  const fields = extractInvoiceFields(`Synthetic Wholesale Ltd\nVAT Reg No: GB${bad}`);
  assert.equal(fields.supplierVatNumber, `GB${bad}`);
  assert.equal(fields.notes.length, 1);
  assert.match(fields.notes[0], /check digit/);
});

test('the uploading company is never returned as the supplier', () => {
  const fields = extractInvoiceFields('Synthetic Bistro Ltd\n1 Example Street\nGreenway Farm Produce\nInvoice No: 5\nTotal: 10.00', { companyName: 'Synthetic Bistro Ltd' });
  assert.equal(fields.supplierName, 'Greenway Farm Produce');
});

test('a saved supplier is linked by VAT number or by name', async () => {
  const saved = [{ id: 'saved-1', companyId: company.id, name: 'Templegate', vatNumber: `GB${VAT}`, email: '', phone: '', address: '', status: 'Active' }];
  const byVat = await processor.processInvoice(doc(`TEMPLEGATE WlNES CASH AND CARRY LTD\nVAT Reg No: ${VAT}\nInvoice No: 9\nTotal: 10.00`), company, [], saved);
  assert.equal(byVat.supplierId, 'saved-1');
  assert.equal(byVat.supplierName, 'Templegate');
  const byName = await processor.processInvoice(doc('Templegate Wines Cash & Carry Limited\nInvoice No: 9\nTotal: 10.00'), company, [], saved);
  assert.equal(byName.supplierId, 'saved-1');
  assert.equal(byName.supplierVatNumber, `GB${VAT}`);
  const other = await processor.processInvoice(doc('Different Trader Ltd\nInvoice No: 9\nTotal: 10.00'), company, [], saved);
  assert.equal(other.supplierName, 'Different Trader Ltd');
  assert.notEqual(other.supplierId, 'saved-1');
});

test('dates in the formats UK invoices use', () => {
  for (const [value, expected] of [
    ['26/10/2026', '2026-10-26'], ['26-10-2026', '2026-10-26'], ['26.10.26', '2026-10-26'], ['2026-10-26', '2026-10-26'],
    ['26 Oct 2026', '2026-10-26'], ['26th October 2026', '2026-10-26'], ['26-Oct-2026', '2026-10-26'], ['26-Oct-26', '2026-10-26'],
    ['October 26, 2026', '2026-10-26'], ['Sept 1 2026', '2026-09-01'], ['1st Mar 2026', '2026-03-01']
  ]) assert.equal(parseFlexibleDate(value), expected, value);
  for (const value of ['31/02/2026', '26 Foo 2026', 'garbage', '']) assert.equal(parseFlexibleDate(value), null, value);
});

test('an invoice asking the payer to quote a reference is not a quotation', () => {
  assert.equal(detectSupportedDocumentKind('scan.pdf', 'Invoice No: 55\nPlease quote invoice number when paying'), 'invoice');
  assert.equal(detectSupportedDocumentKind('scan.pdf', 'TAX INVOICE\nQuote this reference on your remittance'), 'invoice');
  assert.equal(detectSupportedDocumentKind('scan.pdf', 'QUOTATION\nQuote No: Q-17\nValid until 01/12/2026'), 'quotation');
  assert.equal(detectSupportedDocumentKind('quote-17.pdf', 'Total 10.00'), 'quotation');
});

test('quantity-first receipt lines and a wrapped description', () => {
  const fields = extractInvoiceFields(rows([
    ['Qty', 'Description', 'Price', 'Total'],
    ['2', 'Cabbage', '8.00', '16.00'],
    ['3 x Mint bunches @ 2.00', '6.00'],
    ['1', 'Extra virgin olive oil', '12.00', '12.00'],
    ['5 litre tin'],
    ['Total', '34.00']
  ]));
  assert.deepEqual(fields.lines.map(lineSummary), [['Cabbage', 2, 8, 16, 0], ['Mint bunches', 3, 2, 6, 0], ['Extra virgin olive oil 5 litre tin', 1, 12, 12, 0]]);
  assert.equal(fields.net, 34);
});

test('PDF text is rebuilt into rows by position, with column gaps kept', () => {
  const item = (str, x, y) => ({ str, x, y, width: str.length * 5, height: 10 });
  // Drawn out of reading order, as invoice generators often do.
  const text = normalizeDocumentText(layoutPositionedText([
    item('Total', 300, 100), item('£79.00', 500, 100),
    item('Bill To', 40, 700), item('Invoice#', 300, 700.8), item('INV-000110', 420, 700),
    item('Synthetic', 40, 680), item('Bistro', 88, 680), item('Invoice Date', 300, 680), item('26/10/2026', 420, 680),
    item('INVOICE', 300, 730), item('INVOICE', 300.2, 730)
  ]));
  assert.equal(text, 'INVOICE\nBill To\tInvoice#\tINV-000110\nSynthetic Bistro\tInvoice Date\t26/10/2026\nTotal\t£79.00');
  assert.equal(normalizeDocumentText('Bill To      Invoice#   INV-1\n\n\n\nTotal  £1.00', true), 'Bill To\tInvoice#\tINV-1\n\nTotal £1.00');
});

// Header of the Temple Wines sales invoice shown in the client meeting (logo
// on the left, address block on the right), as OCR returns it from a scan.
const templeHeader = (vatLine) => rows([
  ['TEMPLE', 'SALES INVOICE'],
  ['wines', '472 Church Lane'],
  ['', 'Kingsbury'],
  ['', 'London NW9 8UA'],
  ['', 'T: 020 8905 9466'],
  ['', 'F: 020 8200 8395'],
  ['', 'E: info@templewines.co.uk'],
  ['', 'W: www.templewines.co.uk'],
  ['', vatLine],
  ['Cash & Carry Ltd', 'Co. Reg No: 3649717'],
  ['', 'AWRS Reg No: XAAW00000102810'],
  ['Delivery To:', 'Invoice Number:', '295920'],
  ['MUMBAI FUSION', 'Invoice Date:', '01/09/26'],
  ['188-190 KENTON ROAD', 'Account Code:', 'MUM004'],
  ['Description', 'Unit', 'Pack Size', 'Unit Price', 'Value', 'VAT'],
  ['Cobra Beer 12X330ML', '33cl', '12', '13.86', '27.72', 'S'],
  ['Goods', '525.46'], ['VAT', '95.09'], ['Total', '620.55']
]);

test('Temple Wines invoice: supplier from the letterhead, never the "SALES INVOICE" heading', () => {
  const fields = extractInvoiceFields(templeHeader('VAT No GB 795 6464 76'), { companyName: 'Mumbai Fusion' });
  assert.equal(fields.supplierName, 'Temple Wines Cash & Carry Ltd');
  assert.equal(fields.supplierVatNumber, 'GB795646476');
  assert.equal(fields.invoiceNumber, '295920');
  assert.equal(fields.invoiceDate, '2026-09-01');
  assert.equal(fields.customerName, 'MUMBAI FUSION');
  assert.deepEqual(fields.read, { net: 525.46, vat: 95.09, gross: 620.55 });
});

test('VAT number survives common scan misreads in the small print', () => {
  for (const line of ['VAT No G8 795 6464 76', 'VAT No GB 79S 6464 76', 'VAT No GB 795 64б4 7б', 'VAT No. GB795646476'])
    assert.equal(extractInvoiceFields(templeHeader(line), { companyName: 'Mumbai Fusion' }).supplierVatNumber, 'GB795646476', line);
});

test('Temple Wines with columns merged by OCR still gives the supplier and VAT number', () => {
  const fields = extractInvoiceFields(templeHeader('VAT No GB 795 6464 76').replace(/\t/g, ' '), { companyName: 'Mumbai Fusion' });
  assert.match(fields.supplierName, /^Temple Wines/);
  assert.equal(fields.supplierVatNumber, 'GB795646476');
});

test('the full legal name from bank details or terms is preferred when present', () => {
  const statement = rows(['MUMBAI FUSION', 'STATEMENT', 'www.templewines.co.uk', 'Bank Details: Nat West, Temple Wines(Cash & Carry) Ltd., 60-07-38, 58652531', 'Goods remain the property of Temple Wines Cash & Carry Ltd, until payment is received in full.']);
  assert.match(extractInvoiceFields(statement, { companyName: 'Mumbai Fusion' }).supplierName, /^Temple Wines ?\(?Cash & Carry\)? Ltd/);
});

test('free email domains never become a supplier name', () => {
  const fields = extractInvoiceFields(rows(['RIVERSIDE PRODUCE LIMITED', 'orders@gmail.com', 'Invoice No: 12', 'Total: 5.00']));
  assert.equal(fields.supplierName, 'RIVERSIDE PRODUCE LIMITED');
});

// Real Temple Wines layout: item lines in the PDF text layer, letterhead,
// VAT number and VAT analysis only in the page image (OCR).
test('mixed PDF: OCR adds letterhead and VAT analysis, never overrides PDF totals', () => {
  const pdfText = rows([
    'SALES INVOICE',
    ['Invoice To:', 'Delivery To:', 'Invoice Number:', '295920'],
    ['MUMBAI FUSION', 'MUMBAI FUSION', 'Invoice Date:', '01/09/26'],
    ['Code', 'Qty', 'Description', 'Unit', 'Pack Size Unit Price', 'Value'],
    ['51010', '1', 'COBRA BEER KEG', '11Gal', '1', '159.99', '159.99'],
    ['CARTON1', '1', 'DEPOSIT', 'EACH', '1', '50.00', '50.00'],
    ['5053', '2', 'BIRRA MORETTI BOTTLES 12X330ML', '33cl', '12', '13.86', '27.72'],
    ['VAT Analysis', 'Bank Details', 'Goods', '237.71'],
    ['Code', 'Rate', 'Goods', 'Vat Bank Name', 'Nat west', '37.54'],
    ['1', '20.00 %', '187.71', '37.54 Account Name Temple Wines(Cash & Carry) Ltd. Invoice Total', '275.25'],
    ['9', '0.00 %', '50.00', '0.00 Sort Code', '60-07-38']
  ]);
  const ocrText = [
    'TEMPLE        472 Church Lane', 'wines         E: info@remplewines.co.uk', 'W: www. templewines.co.uk',
    'VAL No GB 795 6444 76', 'Cash & Carry Ltd     AWRS Reg No - XSAW00000102810',
    'Invoice To:   Invoice Number:   2895920', 'Goods    595 48',
    '|    20.00 %    187.71    37.54 [AccountName Temple Wines(Cash & Carry) Ltd. |||nygice Total    870.55'
  ].join('\n');
  const merged = mergeImageOcr(pdfText, ocrText);
  assert.ok(!/2895920|870\.55|595 48/.test(merged), 'OCR invoice number and totals are dropped');
  const fields = extractInvoiceFields(merged, { companyName: 'Mumbai Fusion' });
  assert.equal(fields.supplierName, 'Temple Wines (Cash & Carry) Ltd');
  assert.equal(fields.supplierVatNumber, 'GB795644476');
  assert.equal(fields.invoiceNumber, '295920');
  assert.equal(fields.invoiceDate, '2026-09-01');
  assert.equal(fields.customerName, 'MUMBAI FUSION');
  assert.deepEqual([fields.net, fields.vat, fields.gross], [237.71, 37.54, 275.25]);
  assert.deepEqual(fields.lines.map(lineSummary), [
    ['COBRA BEER KEG', 1, 159.99, 159.99, 20], ['DEPOSIT', 1, 50, 50, 0], ['BIRRA MORETTI BOTTLES 12X330ML', 2, 13.86, 27.72, 20]
  ]);
  assert.equal(fields.notes.length, 0);
});

test('images are OCR-ed only when the PDF text lacks VAT number, VAT amount or web contact', () => {
  assert.equal(pdfTextNeedsImageOcr('Invoice 1\nVAT No GB 795 6444 76\nVAT 20.00\nwww.example.co.uk'), false);
  assert.equal(pdfTextNeedsImageOcr('Invoice 1\nTotal 120.00'), true);
});

test('VAT analysis split is refused when two different line sets fit the zero-rated group', () => {
  const fields = extractInvoiceFields(rows([
    ['Code', 'Qty', 'Description', 'Unit', 'Price', 'Value'],
    ['1', '1', 'Item one', 'EA', '25.00', '25.00'], ['2', '1', 'Item two', 'EA', '25.00', '25.00'], ['3', '1', 'Item three', 'EA', '50.00', '50.00'],
    ['Goods', '100.00'], ['Invoice Total', '110.00'],
    ['20.00 %', '50.00', '10.00'], ['0.00 %', '50.00', '0.00']
  ]));
  assert.ok(fields.lines.every(line => line.vatRate === null), 'ambiguous: left for review');
});

// Layouts from real client photos (amounts as printed; names are suppliers, not people).
test('BOC cash sale: logo name, sale number, unknown VAT code column, "Totals:" row', () => {
  const fields = extractInvoiceFields(rows([
    'BOC', 'A Linde company', 'SALE',
    ['Account Number:', '3723139', 'Cash Sale No:', '0269479320'],
    ['Name & Address:-', 'Telephone:'], 'Fax:', ['Synthetic Bistro Ltd', 'Purchase Order:', 'CARD SALE'], ['Date:', '16.10.2026'],
    ['Material', 'Unit', 'Qty', 'Qty', 'Unit', 'Value', 'VAT', 'TX', 'Amount'], ['Description', 'Supp', 'Retn', 'Price'],
    ['566-V', 'CYL', '2', '0', '32.46', '64.92', '12.98', 'AB', '77.90'], 'SUREMIX 60 SIZE V.', ['Serial Number:', '21566163808574'],
    ['569-B', 'CYL', '2', '0', '31.05', '62.10', '12.42', 'AB', '74.52'], 'SUREGAS SIZE B.',
    ['Totals:', '127.02', '25.40', '152.42'], 'Company VAT Registration Number : GB226556555',
    ['V A T - Rate', 'VAT Exclusive', 'VAT Value'], ['AB 20.00 %', '127.02', '25.40']
  ]), { companyName: 'Synthetic Bistro Ltd' });
  assert.equal(fields.supplierName, 'BOC');
  assert.equal(fields.invoiceNumber, '0269479320');
  assert.equal(fields.invoiceDate, '2026-10-16');
  assert.equal(fields.supplierVatNumber, 'GB226556555');
  assert.deepEqual([fields.net, fields.vat, fields.gross], [127.02, 25.4, 152.42]);
  assert.deepEqual(fields.lines.map(line => [line.quantity, line.unitPrice, line.netAmount, line.vatRate]), [[2, 32.46, 64.92, 20], [2, 31.05, 62.1, 20]]);
  assert.match(fields.lines[0].description, /SUREMIX 60 SIZE V/);
});

test('mixed 20% / 0% invoice: starred lines take the 0% group from the VAT analysis', () => {
  const items = [['51010', 1, 'COBRA BEER KEG', 154.99], ['51011', 1, 'KINGFISHER KEG', 172.99], ['0372', 2, 'STILL WATER GLASS', 10.49], ['0157', 2, '* MONIN PURE SUGAR CANE SYRUP', 6.89], ['0060', 1, '* MONIN STRAWBERRY SYRUP', 7.29]];
  const fields = extractInvoiceFields(rows([
    ['Invoice Number:', '295646'], ['Invoice Date:', '28/08/26'], ['Code', 'Qty', 'Description', 'Unit', 'Pack Size', 'Unit Price', 'Value'],
    ...items.map(([c, q, d, p]) => [c, String(q), d, '70cl', '1', p.toFixed(2), (q * p).toFixed(2)]),
    ['VAT Analysis', 'Bank Details', 'Goods', '369.03'], ['Code', 'Rate', 'Goods', 'Vat', 'Bank Name', 'Nat west', 'VAT', '69.39'],
    ['1', '20.00 %', '348.96', '69.79', 'Invoice Total', '438.82'], ['3', '0.00 %', '21.07', '0.00']
  ]));
  assert.deepEqual(fields.lines.map(line => line.vatRate), [20, 20, 20, 0, 0]);
  assert.equal(fields.lines[3].description, 'MONIN PURE SUGAR CANE SYRUP');
});

test('totals misread by OCR are taken from the self-checking VAT analysis box', () => {
  const box = (goods, total) => rows([
    ['Invoice Number:', '291156'], ['Code', 'Qty', 'Description', 'Unit', 'Pack Size', 'Unit Price', 'Value'],
    ['51010', '1', 'COBRA BEER KEG', '11Gal', '1', '154.99', '154.99'], ['51011', '1', 'KINGFISHER KEG', '11Gal', '1', '172.99', '172.99'], ['1132', '1', 'IRISH WHISKY', '1.5Lit', '1', '41.49', '41.49'],
    ['VAT Analysis', 'Bank Details', 'Goods', goods], ['Code', 'Rate', 'Goods', 'Vat', 'Bank Name', 'Nat west'],
    ['1', '20.00 %', '369.47', '73.89', 'Account Name', 'Synthetic Wines Ltd.', ...(total ? ['Invoice Total', total] : [])]
  ]);
  const misread = extractInvoiceFields(box('360.47', '443.36'));
  assert.deepEqual([misread.net, misread.vat, misread.gross], [369.47, 73.89, 443.36]);
  assert.ok(misread.lines.every(line => line.vatRate === 20));
  const noTotal = extractInvoiceFields(box('738.94', null));
  assert.deepEqual([noTotal.net, noTotal.vat, noTotal.gross], [369.47, 73.89, 443.36]);
});

test('invoice number is never taken from "Invoice Total" when the number label is misread', () => {
  const fields = extractInvoiceFields(rows([
    ['Invoice Numbr:', '295646'], ['Invoice Date:', '28/08/26'],
    ['Code', 'Qty', 'Description', 'Unit', 'Pack Size', 'Unit Price', 'Value'], ['51010', '1', 'COBRA BEER KEG', '11Gal', '1', '154.99', '154.99'],
    ['Goods', '154.99'], ['VAT', '31.00'], ['Invoice Total', '185.99']
  ]));
  assert.notEqual(fields.invoiceNumber, '185.99');
  assert.ok(!/^\d+\.\d{2}$/.test(fields.invoiceNumber), fields.invoiceNumber);
});

// Shapes seen in real phone photos of supplier invoices (all values synthetic).
test('"20.0% S" sets the VAT rate even when OCR garbled the table heading', () => {
  const fields = extractInvoiceFields(rows([
    ['Vat Invoice 32558'], ['ACTIVITY', 'DESCRIPTION', 'var av RATE Mou'],
    ['CF02', 'CENTREFEED ROLL BLUE 175mm X 150m-1 20.0% S', '2 10.99', '21.98'],
    ['TP01', 'Soft Toilet Roll 2ply - 1x40', '20.0% S', '1', '11.50', '11.50']
  ]));
  assert.deepEqual(fields.lines.map(line => [line.quantity, line.unitPrice, line.vatRate]), [[2, 10.99, 20], [1, 11.5, 20]]);
  assert.ok(fields.lines.every(line => !/20\.0%/.test(line.description)), fields.lines.map(line => line.description).join(' | '));
});

test('amount due printed under its heading ("PLEASE PAY" / "GBP 404.30")', () => {
  const fields = extractInvoiceFields(rows([
    ['INVOICE TO', 'SHIP TO'], ['SYNTHETIC CATERING', 'SYNTHETIC CATERING', 'DATE', 'PLEASE PAY', 'DUE DATE'], ['LTD', 'LTD', '17/11/2026', 'GBP 120.00', '17/11/2026'],
    ['Code', 'Description', 'Qty', 'Rate', 'Amount'], ['A1', 'Napkins 1X2000', '1', '100.00', '100.00']
  ]));
  assert.equal(fields.gross, 120);
  assert.equal(fields.vat, 20);
});

test('carton units, a decimal point lost by OCR, a "Total Qty" row and a reference split by OCR', () => {
  const fields = extractInvoiceFields(rows([
    'Invoice SYNUK/26-27/ 1390', ['Invoice Date', 'Due Date'], ['17/11/2026', '17/11/2026'],
    ['SR', 'CATEGORY', 'DESCRIPTION', 'WT', 'CASE', 'QUANTITY', 'UNIT PRICE', 'AMOUNT'],
    ['1 FROZEN [DKB1] DEEP KABABS HARA', '0.300 | 18', '1.00 CTN', '67.58', '£67.58'],
    ['2 FROZEN [IJPS] PUNJABI SAMOSA', '1.050 | 4', '2.00 CTN', '27.46', '£5492'],
    ['Total Qty', '3', '£12250'], ['Total', '£122.50']
  ]));
  assert.equal(fields.invoiceNumber, 'SYNUK/26-27/1390');
  assert.deepEqual(fields.lines.map(line => [line.quantity, line.unitPrice, line.netAmount]), [[1, 67.58, 67.58], [2, 27.46, 54.92]]);
  assert.deepEqual([fields.net, fields.vat, fields.gross], [122.5, 0, 122.5]);
});

test('price and amount merged into one cell by OCR still give the item; boxed footer is not an item', () => {
  const fields = extractInvoiceFields(rows([
    ['Code', 'Qty', 'Description', 'Unit Pack Size Unit Price', 'Value'],
    ['51010', '1', 'COBRA BEER KEG', '11Gal', '1', '154.99 154.99'],
    ['Cod', 'VAT Analysis', 'Bank Details', 'G', '154.99'], ['e Rate', 'Goods', 'Vat [Bank Name Nat west', 'oods', '; 3 89']
  ]));
  assert.deepEqual(fields.lines.map(line => [line.description, line.quantity, line.unitPrice]), [['COBRA BEER KEG', 1, 154.99]]);
});

test('supplementary sparse reading fills totals the main reading missed, never replacing consistent ones', () => {
  const main = rows([['Invoice Number:', '291156'], ['Code', 'Qty', 'Description', 'Unit Price', 'Value'], ['51010', '1', 'COBRA BEER KEG', '154.99', '154.99'], ['51011', '1', 'KINGFISHER KEG', '172.99', '172.99'], ['{linvoice Total', '443 3'], '36']);
  const sparse = ['VAT Analysis', 'Goods', '327.98', 'VAT', '65.60', 'Invoice Total', '393.58'].join('\n');
  const fields = extractInvoiceFields(main + '\n\f\n' + sparse);
  assert.deepEqual([fields.net, fields.vat, fields.gross], [327.98, 65.6, 393.58]);
  assert.ok(fields.lines.every(line => line.vatRate === 20));
  assert.equal(fields.lines.length, 2, 'sparse text adds no items');
  const consistent = extractInvoiceFields(rows([['Goods', '100.00'], ['VAT', '20.00'], ['Invoice Total', '120.00']]) + '\n\f\n' + ['Invoice Total', '999.99'].join('\n'));
  assert.equal(consistent.gross, 120);
});

test('lines that do not make the invoice total are flagged (likely a second page)', () => {
  const fields = extractInvoiceFields(rows([
    ['DESCRIPTION', 'VAT', 'QTY', 'RATE', 'AMOUNT'], ['Napkins', '20.0% S', '1', '100.00', '100.00'], ['PLEASE PAY', 'GBP 180.00']
  ]));
  assert.equal(fields.gross, 180);
  assert.ok(fields.notes.some(note => /more pages/.test(note)), fields.notes.join(' | '));
});
