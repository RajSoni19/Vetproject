// Converts text read from an invoice (browser OCR / PDF text) into the line
// format the database invoice API accepts (lib/server/saas/vat.ts vatLine).
// VAT treatment is never guessed: a line whose rate the document does not
// evidence becomes "not-evidenced" (rate 0, excluded from reclaimable VAT
// until a person reviews it).
import { extractInvoiceFields, type ExtractedInvoiceLine } from "@/lib/invoice-text-extraction";

// printed: the line amount exactly as printed on the document (the AMOUNT column),
// shown next to the calculated amount so a misread is visible. Not sent to the API.
export type DraftLine = { description: string; quantity: string; unitPrice: string; discount: string; rate: string; treatment: string; pricing: string; printed?: string };
export type InvoiceDraft = {
  supplierName: string; supplierVatNumber: string; number: string; issuedOn: string; dueOn: string; currency: string;
  lines: DraftLine[]; warnings: string[]; source: string;
  summary: { net: number | null; vat: number | null; gross: number | null; customerName: string };
};

// Decimal strings within the API's bounds (quantity/price 4 dp, discount 2 dp).
const decimal = (value: number, places: number) => {
  if (!Number.isFinite(value) || value < 0) return "0";
  return value.toFixed(places).replace(/\.?0+$/, "") || "0";
};

export function draftLine(line: ExtractedInvoiceLine): DraftLine {
  const base = { description: line.description.slice(0, 2000), quantity: decimal(line.quantity, 4), unitPrice: decimal(line.unitPrice, 4), discount: "0", pricing: "exclusive", printed: line.netAmount.toFixed(2) };
  if (line.vatRate === null) return { ...base, rate: "0", treatment: "not-evidenced" };
  if (line.taxClassification === "Exempt") return { ...base, rate: "0", treatment: "exempt" };
  if (line.taxClassification === "Out of scope") return { ...base, rate: "0", treatment: "outside" };
  if (line.vatRate === 0) return { ...base, rate: "0", treatment: "zero" };
  return { ...base, rate: decimal(line.vatRate, 2), treatment: line.vatRate <= 5 ? "reduced" : "standard" };
}

export function invoiceDraftFromText(text: string, fileName: string, context: { companyName?: string; companyVatNumber?: string } = {}): InvoiceDraft {
  const fields = extractInvoiceFields(text, context);
  const lines = fields.lines.map(draftLine);
  // No line table found: one line carrying the invoice net, so totals are kept.
  if (!lines.length && fields.net !== null && fields.net > 0) {
    const rate = fields.vat !== null && fields.net > 0 ? Math.round(fields.vat / fields.net * 10000) / 100 : null;
    const known = rate !== null && [0, 5, 20].includes(rate);
    lines.push({ description: "Invoice total (line breakdown not detected)", quantity: "1", unitPrice: decimal(fields.net, 2), discount: "0", pricing: "exclusive",
      rate: known && rate! > 0 ? String(rate) : "0", treatment: !known ? "not-evidenced" : rate === 0 ? "zero" : rate === 5 ? "reduced" : "standard" });
  }
  const warnings = [...fields.notes];
  const missing = [!fields.supplierName && "supplier", !fields.invoiceNumber && "invoice number", !fields.invoiceDate && "invoice date", fields.gross === null && "gross total"].filter(Boolean);
  if (missing.length) warnings.push(`Not found on the document: ${missing.join(", ")}. Enter them from the original.`);
  if (lines.some(line => line.treatment === "not-evidenced")) warnings.push("VAT not evidenced on some lines — choose the correct VAT treatment before confirming.");
  if (!fields.lines.length && lines.length) warnings.push("Line breakdown not detected: one line carries the invoice net total.");
  return {
    supplierName: fields.supplierName, supplierVatNumber: fields.supplierVatNumber, number: fields.invoiceNumber,
    issuedOn: fields.invoiceDate ?? "", dueOn: fields.dueDate ?? "", currency: fields.currency ?? "",
    lines, warnings, source: fileName,
    summary: { net: fields.net, vat: fields.vat, gross: fields.gross, customerName: fields.customerName }
  };
}
