import type { Company, Invoice, StoredDocument } from "@/lib/domain";
import { calculateInvoiceTotals, calculateLine, buildVATBreakdown } from "@/lib/vat-calculations";
import { toMinorUnits, decimalUnits } from "@/lib/money";

export function parseInvoiceDate(value?: string): string | null {
  if (!value) return null;
  let year: number, month: number, day: number;
  const iso = value.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const numeric = value.trim().match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{2,4})$/);
  const named = value.trim().match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (iso) [, year, month, day] = iso.map(Number);
  else if (numeric) { day = Number(numeric[1]); month = Number(numeric[2]); year = Number(numeric[3]) + (numeric[3].length === 2 ? 2000 : 0); }
  else if (named) { day = Number(named[1]); month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(named[2].slice(0, 3).toLowerCase()) + 1; year = Number(named[3]); }
  else return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1900 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.toISOString().slice(0, 10) : null;
}

export function findDuplicateInvoice(invoice: Pick<Invoice, "id" | "companyId" | "supplierId" | "supplierName" | "invoiceNumber"> & Pick<Partial<Invoice>, "transactionType">, invoices: Invoice[]) {
  const normal = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();
  return invoices.find((other) => other.id !== invoice.id && other.companyId === invoice.companyId && (other.transactionType === "Sale") === (invoice.transactionType === "Sale") && Boolean(normal(invoice.invoiceNumber)) && normal(other.invoiceNumber) === normal(invoice.invoiceNumber) &&
    (invoice.transactionType === "Sale" || (Boolean(invoice.supplierId) && invoice.supplierId !== "supplier-unassigned" && other.supplierId === invoice.supplierId) || normal(other.supplierName) === normal(invoice.supplierName)));
}

export function validateInvoice(invoice: Invoice, invoices: Invoice[] = []) {
  const errors: string[] = [];
  if (!invoice.supplierName.trim()) errors.push(invoice.transactionType === "Sale" ? "Enter the invoice issuer name." : "Enter a supplier name.");
  if (invoice.transactionType === "Sale" && !invoice.customerName.trim()) errors.push("Enter a customer name for a sales invoice.");
  if (!invoice.invoiceNumber.trim()) errors.push("Enter an invoice number.");
  const invoiceDate = parseInvoiceDate(invoice.invoiceDate), dueDate = parseInvoiceDate(invoice.dueDate);
  if (!invoiceDate || invoiceDate !== invoice.invoiceDate) errors.push("Enter a valid invoice date in YYYY-MM-DD format.");
  if (invoice.dueDate && (!dueDate || dueDate !== invoice.dueDate || invoiceDate && dueDate < invoiceDate)) errors.push("Due date must be valid (YYYY-MM-DD) and on or after the invoice date.");
  if (!["GBP", "EUR", "USD"].includes(invoice.currency)) errors.push("Choose a supported currency.");
  if (!invoice.lineItems.length) errors.push("Add at least one line item.");
  if (invoice.vatRateNeedsReview) errors.push("Confirm the VAT treatment for every line; missing VAT is not automatically zero-rated.");
  for (const [index, line] of invoice.lineItems.entries()) {
    if (!line.description.trim() || !Number.isFinite(line.quantity) || line.quantity <= 0 || [line.unitPrice, line.discount, line.vatRate].some((value) => !Number.isFinite(value) || value < 0) || line.vatRate > 100 || Math.max(line.quantity, line.unitPrice) > 100000000 || decimalUnits(line.quantity, 4) / 10000 !== line.quantity || decimalUnits(line.unitPrice, 4) / 10000 !== line.unitPrice || toMinorUnits(line.discount) / 100 !== line.discount || decimalUnits(line.vatRate, 2) / 100 !== line.vatRate || line.discount > line.quantity * line.unitPrice) errors.push(`Line ${index + 1}: check description, positive quantity, price, discount and VAT (up to 4 decimals for quantity/price, 2 for discount/rate).`);
    const calculated = calculateLine(line);
    if (["netAmount", "vatAmount", "grossAmount"].some((key) => !Number.isFinite(line[key as "netAmount"]) || toMinorUnits(line[key as "netAmount"]) !== toMinorUnits(calculated[key as "netAmount"]))) errors.push(`Line ${index + 1}: amounts do not match quantity, price, discount and VAT.`);
  }
  const totals = calculateInvoiceTotals(invoice.lineItems);
  if ([invoice.subtotal, invoice.vatAmount, invoice.totalAmount].some((value) => !Number.isFinite(value) || value < 0 || value > 1000000000000 || toMinorUnits(value) / 100 !== value) || invoice.totalAmount <= 0) errors.push("Invoice amounts must be valid with at most two decimals and the gross total positive (maximum 1 trillion).");
  if (toMinorUnits(invoice.subtotal) !== toMinorUnits(totals.subtotal) || toMinorUnits(invoice.vatAmount) !== toMinorUnits(totals.vatAmount) || toMinorUnits(invoice.totalAmount) !== toMinorUnits(totals.totalAmount)) errors.push("Invoice net, VAT and gross totals must match the line totals.");
  if (findDuplicateInvoice(invoice, invoices)) errors.push("An invoice with this number already exists for this issuer/supplier and company. Open that record instead.");
  return [...new Set(errors)];
}

export function createInvoiceDraft(company: Company): Invoice {
  const now = new Date().toISOString();
  const lineItems = [calculateLine({ description: "", quantity: 1, unitPrice: 0, discount: 0, vatRate: 0 })];
  return { id: crypto.randomUUID(), companyId: company.id, supplierId: "", documentId: "", supplierName: "", supplierVatNumber: "", invoiceNumber: "", invoiceDate: "", dueDate: "", currency: company.currency, customerName: company.name, customerVatNumber: company.vatNumber, ...calculateInvoiceTotals(lineItems), lineItems, vatBreakdown: buildVATBreakdown(lineItems), status: "Draft", processingStatus: "Ready for Review", reviewStatus: "Needs Review", confidence: "Needs review", warnings: [], activity: [], createdAt: now, updatedAt: now };
}

export function upsertInvoice(invoices: Invoice[], invoice: Invoice) {
  if (invoices.some((item) => item.id === invoice.id && item.companyId !== invoice.companyId)) throw new Error("Cannot move an invoice between companies.");
  return [invoice, ...invoices.filter((item) => item.id !== invoice.id)];
}

export function validateInvoiceDocument(invoice: Invoice, documents: StoredDocument[], invoices: Invoice[]) {
  if (!invoice.documentId) return;
  const document = documents.find((item) => item.id === invoice.documentId);
  if (!document) throw new Error("Original document metadata was not found. Restore the original or remove the attachment before saving.");
  if (document.companyId && document.companyId !== invoice.companyId) throw new Error("Choose an original from this company.");
  if (document.associatedInvoiceId && document.associatedInvoiceId !== invoice.id || invoices.some((item) => item.documentId === invoice.documentId && item.id !== invoice.id)) throw new Error("This original is already linked to another invoice. Open that record instead.");
}
