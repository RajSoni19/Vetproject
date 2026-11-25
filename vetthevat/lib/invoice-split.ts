// One PDF holding several separate invoices (a supplier's "sales invoice report": one invoice per
// page, each with its own number and totals). Each invoice must be checked and saved on its own,
// so the text is split at the page footers ("Page 3 of 13") and pages are grouped by invoice number.
import { extractInvoiceFields } from "@/lib/invoice-text-extraction";

export type InvoicePart = { number: string; date: string | null; text: string };

const PAGE_FOOTER = /\bpage\s+\d+\s+of\s+\d+\b/i;

export function splitInvoiceText(text: string): InvoicePart[] {
  // Text PDFs only: a photo's supplementary reading (after the form feed) is not split.
  if (text.includes("\f")) return [];
  const pages: string[] = [];
  let current: string[] = [];
  for (const line of text.split("\n")) {
    current.push(line);
    if (PAGE_FOOTER.test(line)) { pages.push(current.join("\n")); current = []; }
  }
  if (current.join("").trim()) pages.push(current.join("\n"));
  if (pages.length < 2) return [];
  const parts: InvoicePart[] = [];
  for (const page of pages) {
    const fields = extractInvoiceFields(page);
    const last = parts.at(-1);
    // A page without its own invoice number, or with the same number, continues the invoice before it.
    if (last && (!fields.invoiceNumber || fields.invoiceNumber === last.number)) { last.text += `\n${page}`; continue; }
    parts.push({ number: fields.invoiceNumber, date: fields.invoiceDate, text: page });
  }
  // Several invoices only when each has its own number and its own total.
  const separate = parts.length >= 2 && new Set(parts.map(part => part.number)).size === parts.length
    && parts.every(part => part.number && extractInvoiceFields(part.text).gross !== null);
  return separate ? parts : [];
}
