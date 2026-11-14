const { loadSource } = require('./tests/load-source.cjs');
const { extractInvoiceFields } = loadSource('lib/invoice-text-extraction');

const text = `
LE
es
Ltd
472 Church Lane
Kingsbury
London NW9 8UA
T: 020 8905 9484
F: 020 8200 8393
E: info@templewines.co.uk
W: www.templewines.co.uk
VAT No GB 795 6444 76
Co. Reg 2649717
AWRS Reg No : XSAW00000102810

STATEMENT

Statement Date: 12/11/26
Page: 1
Account Code: MUM004
Terms: 14 DAYS

Debit Amt    Credit Amt    Outstanding    Balance
399.97       0.00          0.00           0.00
620.55

Bank Details: Nat West, Temple Wines(Cash & Carry) Ltd. Account No: 12345678 Sort Code: 01-02-03
`;

const res = extractInvoiceFields(text, { companyName: "ABC Catering Ltd", companyVatNumber: "GB123456789" });
console.log("EXTRACTED RESULT:", {
  supplierName: res.supplierName,
  supplierVatNumber: res.supplierVatNumber,
  customerName: res.customerName,
  customerVatNumber: res.customerVatNumber,
  invoiceNumber: res.invoiceNumber,
  invoiceDate: res.invoiceDate,
  read: res.read,
  notes: res.notes
});
