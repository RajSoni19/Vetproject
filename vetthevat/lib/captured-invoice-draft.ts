// Converts what was read from an invoice or till receipt (PDF text, on-device
// OCR, or the AI reader) into the line format the database invoice API accepts
// (lib/server/saas/vat.ts vatLine). VAT treatment is never guessed: a line whose
// rate the document does not evidence becomes "not-evidenced" (rate 0, no VAT
// claimed until a person reviews it).
import { assignFromVatAnalysis, extractInvoiceFields, validUkVat, type ExtractedInvoiceFields, type ExtractedInvoiceLine } from "@/lib/invoice-text-extraction";
import { closeTo, dateWarning, lineTotal, missingPageWarning, pageInfoFromText, round2, totalsWarning } from "@/lib/invoice-checks";
import type { AiInvoice, AiInvoiceLine } from "@/lib/ai-invoice";

// printed: the line amount exactly as printed on the document (the AMOUNT column),
// shown next to the calculated amount so a misread is visible. Not sent to the API.
export type DraftLine = { description: string; quantity: string; unitPrice: string; discount: string; rate: string; treatment: string; pricing: string; printed?: string };
export type InvoiceReader = "pdf-text" | "gemini" | "tesseract";
export type InvoiceDraft = {
  supplierName: string; supplierVatNumber: string; number: string; issuedOn: string; dueOn: string; currency: string;
  lines: DraftLine[]; warnings: string[]; source: string;
  // supplierId: a saved supplier the person chose before scanning.
  supplierId?: string; receipt?: boolean;
  // How the document was read (source above is the file name).
  readBy?: InvoiceReader;
  summary: { net: number | null; vat: number | null; gross: number | null; customerName: string };
};
// A saved supplier chosen before scanning: its name and VAT number are used
// instead of the ones read from the document.
export type ChosenSupplier = { id: string; name: string; vatNumber: string };
export type DraftContext = { companyName?: string; companyVatNumber?: string; supplier?: ChosenSupplier; pageCount?: number; today?: Date; readBy?: InvoiceReader };

// Decimal strings within the API's bounds (quantity/price 4 dp, discount 2 dp).
const decimal = (value: number, places: number) => {
  if (!Number.isFinite(value) || value < 0) return "0";
  return value.toFixed(places).replace(/\.?0+$/, "") || "0";
};

// "Greek style yogurt Skg": 5 read as S right before a unit.
const cleanDescription = (value: string) => value.replace(/(^|[\s(x×])[Ss](?=(?:kg|g|ml|cl|ltr|lt)\b)/g, "$15").slice(0, 2000);

export function draftLine(line: ExtractedInvoiceLine & { amountNotPrinted?: boolean }): DraftLine {
  const base: DraftLine = { description: cleanDescription(line.description), quantity: decimal(line.quantity, 4), unitPrice: decimal(line.unitPrice, 4), discount: decimal(line.discount ?? 0, 2), rate: "0", treatment: "not-evidenced", pricing: line.inclusive ? "inclusive" : "exclusive", printed: line.netAmount.toFixed(2) };
  if (line.amountNotPrinted) delete base.printed;
  if (line.vatRate === null) return base;
  if (line.taxClassification === "Exempt") return { ...base, rate: "0", treatment: "exempt" };
  if (line.taxClassification === "Out of scope") return { ...base, rate: "0", treatment: "outside" };
  if (line.vatRate === 0) return { ...base, rate: "0", treatment: "zero" };
  return { ...base, rate: decimal(line.vatRate, 2), treatment: line.vatRate <= 5 ? "reduced" : "standard" };
}

const TOTALS_PROBLEM = /^A page or item may be missing|line items do not add up|invoice total does not match the items/i;

// What the read lines say the document should total, whichever way it was read.
function linesTotal(fields: ExtractedInvoiceFields) {
  let goods = 0, lineVat = 0;
  for (const line of fields.lines) {
    goods += line.netAmount;
    const rate = line.vatRate ?? 0;
    lineVat += line.netAmount * rate / (line.inclusive ? 100 + rate : 100);
  }
  return round2(fields.lines.every((line) => line.inclusive) ? goods : goods + (fields.vat ?? lineVat));
}

function draftFromFields(fields: ExtractedInvoiceFields, fileName: string, context: DraftContext, pageInfo: string | null) {
  const lines = fields.lines.map(draftLine);
  // No line table found: one line carrying the invoice net, so totals are kept.
  if (!lines.length && fields.net !== null && fields.net > 0) {
    const rate = fields.vat !== null && fields.net > 0 ? Math.round(fields.vat / fields.net * 10000) / 100 : null;
    const known = rate !== null && [0, 5, 20].includes(rate);
    lines.push({ description: "Invoice total (line breakdown not detected)", quantity: "1", unitPrice: decimal(fields.net, 2), discount: "0", pricing: "exclusive",
      rate: known && rate! > 0 ? String(rate) : "0", treatment: !known ? "not-evidenced" : rate === 0 ? "zero" : rate === 5 ? "reduced" : "standard" });
  }
  const chosen = context.supplier;
  // With a chosen supplier, notes about the supplier VAT number read from the document no longer apply.
  const warnings = fields.notes.filter((note) => !(chosen && /^VAT number/.test(note)));
  const totals = fields.lines.length && !warnings.some((warning) => TOTALS_PROBLEM.test(warning)) ? totalsWarning(linesTotal(fields), fields.gross, fields.lines.length) : null;
  for (const warning of [totals, missingPageWarning(pageInfo, context.pageCount), dateWarning(fields.invoiceDate, context.today)]) if (warning) warnings.push(warning);
  const missing = [!chosen && !fields.supplierName && "supplier", !fields.invoiceNumber && (fields.receipt ? "receipt number" : "invoice number"), !fields.invoiceDate && (fields.receipt ? "receipt date" : "invoice date"), fields.gross === null && "gross total"].filter(Boolean);
  if (missing.length) warnings.push(`Not found on the document: ${missing.join(", ")}. Enter them from the original.`);
  if (lines.some(line => line.treatment === "not-evidenced")) warnings.push("VAT not evidenced on some lines — no VAT is claimed for them unless you choose the correct VAT before confirming.");
  if (!fields.lines.length && lines.length) warnings.push("Line breakdown not detected: one line carries the invoice net total.");
  return {
    supplierName: chosen?.name ?? fields.supplierName, supplierVatNumber: chosen ? chosen.vatNumber : fields.supplierVatNumber, number: fields.invoiceNumber,
    issuedOn: fields.invoiceDate ?? "", dueOn: fields.dueDate ?? "", currency: fields.currency ?? "",
    lines, warnings: [...new Set(warnings)], source: fileName, ...(chosen ? { supplierId: chosen.id } : {}), ...(fields.receipt ? { receipt: true } : {}), ...(context.readBy ? { readBy: context.readBy } : {}),
    summary: { net: fields.net, vat: fields.vat, gross: fields.gross, customerName: fields.customerName }
  } satisfies InvoiceDraft;
}

// VAT of draft lines under each rounding rule the API supports: per line, or per VAT rate (the
// way most suppliers work it out: 20% of all 20% goods).
type RoundableLine = Pick<DraftLine, "quantity" | "unitPrice" | "discount" | "rate" | "treatment" | "pricing">;
const NO_VAT = ["zero", "exempt", "outside", "not-evidenced"];
export function draftVat(lines: readonly RoundableLine[], rounding: "line-half-up" | "tax-group-half-up") {
  const exact = lines.map((line) => {
    const base = Math.round(Number(line.quantity) * Number(line.unitPrice) * 100) / 100 - Number(line.discount || 0);
    const rate = NO_VAT.includes(line.treatment) ? 0 : Number(line.rate || 0) / 100;
    return { key: `${line.treatment}/${rate}/${line.pricing}`, tax: line.pricing === "inclusive" ? base * rate / (1 + rate) : base * rate };
  });
  if (rounding === "line-half-up") return round2(exact.reduce((sum, row) => sum + round2(row.tax), 0));
  const groups = new Map<string, number>();
  for (const row of exact) groups.set(row.key, (groups.get(row.key) ?? 0) + row.tax);
  return round2([...groups.values()].reduce((sum, tax) => sum + round2(tax), 0));
}
// Rounding for a scanned invoice: per VAT rate when only that gives the VAT printed on the
// document (Temple: 20% of 944.89 = 188.98, per line it would be 189.00), otherwise per line.
export function draftRounding(draft: Pick<InvoiceDraft, "lines" | "summary">): "line-half-up" | "tax-group-half-up" {
  const printed = draft.summary.vat;
  if (printed === null || !draft.lines.length) return "line-half-up";
  const near = (value: number) => Math.abs(value - printed) < 0.005;
  return !near(draftVat(draft.lines, "line-half-up")) && near(draftVat(draft.lines, "tax-group-half-up")) ? "tax-group-half-up" : "line-half-up";
}

export function invoiceDraftFromText(text: string, fileName: string, context: DraftContext = {}): InvoiceDraft {
  return draftFromFields(extractInvoiceFields(text, context), fileName, context, pageInfoFromText(text));
}

// The reading did not reconcile: its totals disagree, or no usable items or total were found.
export const hasTotalsProblem = (draft: InvoiceDraft) => draft.summary.gross === null || draft.warnings.some((warning) => TOTALS_PROBLEM.test(warning) || /^Line breakdown not detected/.test(warning));

const sameName = (a: string, b: string) => a.toLowerCase().replace(/[^a-z0-9]/g, "") === b.toLowerCase().replace(/[^a-z0-9]/g, "");

type AiDraftLine = ExtractedInvoiceLine & { amountNotPrinted?: boolean };

function aiLine(line: AiInvoiceLine, rate: number | null, inclusive: boolean): AiDraftLine {
  const amount = line.amount;
  let quantity = line.quantity;
  if (quantity === null && line.unit_price && amount !== null) { const whole = amount / line.unit_price; if (whole >= 1 && closeTo(whole, Math.round(whole), 0.001)) quantity = Math.round(whole); }
  quantity ??= 1;
  const unitPrice = line.unit_price ?? (amount !== null ? Math.round(Math.abs(amount) / quantity * 10000) / 10000 : 0);
  // A member price each ("Cc £12.00") fixes the discount exactly.
  const discount = line.offer_price !== null && line.offer_price < unitPrice ? round2(quantity * (unitPrice - line.offer_price)) : line.discount ?? 0;
  const calculated = lineTotal(quantity, unitPrice, discount);
  // The printed amount is usually before the discount shown under the item; some documents print it after.
  const paid = amount === null ? null : closeTo(amount, calculated) ? amount : round2(amount - discount);
  // "2 Demo Drink" with quantity 2: the number is the quantity, not part of the name.
  const description = line.description.startsWith(`${quantity} `) && /^[A-Za-z]/.test(line.description.slice(String(quantity).length + 1)) ? line.description.slice(String(quantity).length + 1) : line.description;
  return { description, quantity, unitPrice, netAmount: paid ?? calculated, vatRate: rate, inclusive, ...(discount ? { discount } : {}), ...(paid === null ? { amountNotPrinted: true } : {}) };
}

// A receipt that misses its total because a member price each was returned as the
// discount ("Cc £10.00" as 10.00 off): apply the fewest such corrections that make
// the lines equal the printed total exactly. Otherwise nothing changes.
function repairOfferPrices(lines: AiDraftLine[], total: number | null) {
  if (total === null) return;
  const paid = (list: AiDraftLine[]) => round2(list.reduce((sum, line) => sum + line.netAmount, 0));
  if (closeTo(paid(lines), total)) return;
  const candidates = lines.flatMap((line, index) => line.discount && line.discount < line.unitPrice ? [index] : []);
  if (!candidates.length || candidates.length > 12) return;
  const masks = Array.from({ length: 2 ** candidates.length - 1 }, (_, mask) => mask + 1).sort((a, b) => a.toString(2).replace(/0/g, "").length - b.toString(2).replace(/0/g, "").length);
  for (const mask of masks) {
    const trial = lines.map((line) => ({ ...line }));
    candidates.forEach((index, bit) => {
      if (!(mask & (1 << bit))) return;
      const line = trial[index], discount = round2(line.quantity * (line.unitPrice - (line.discount as number)));
      Object.assign(line, { discount, netAmount: lineTotal(line.quantity, line.unitPrice, discount) });
    });
    if (closeTo(paid(trial), total)) { lines.splice(0, lines.length, ...trial); return; }
  }
}

// An invoice date more than a month in the future is a misread year ("28/08/26" read as 2028): the
// latest year, this year or last, that puts the same day in the past is used, with a note to check it.
function pastInvoiceDate(iso: string | null, today: Date, notes: string[]): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const day = 86400000, now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (Date.parse(`${iso}T00:00:00Z`) <= now + 31 * day) return iso;
  const uk = (value: string) => `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;
  for (const year of [today.getUTCFullYear(), today.getUTCFullYear() - 1]) {
    const candidate = `${year}${iso.slice(4)}`, time = Date.parse(`${candidate}T00:00:00Z`);
    if (Number.isFinite(time) && time <= now + day) { notes.push(`The invoice date was read as ${uk(iso)}, which is in the future, so the year was corrected to ${uk(candidate)}. Check it against the original.`); return candidate; }
  }
  return iso;
}

// The invoice's own VAT figures win over per-line rates that disagree with them (the reader may put
// 20% on every line of an invoice whose VAT box shows 20% on some goods and 0% on the rest). Lines
// are re-rated only when the result matches the printed VAT exactly; otherwise a note asks for a check.
function reconcileLineRates(lines: AiDraftLine[], summary: AiInvoice["vat_summary"], statedVat: number | null, notes: string[]) {
  if (!lines.length || statedVat === null) return;
  const net = lines.reduce((sum, line) => sum + line.netAmount, 0);
  const vatOf = (list: { netAmount: number; vatRate: number | null }[]) => round2(list.reduce((sum, line) => sum + line.netAmount * (line.vatRate ?? 0) / 100, 0));
  const tolerance = Math.max(0.02, 0.005 * lines.length);
  if (lines.every((line) => line.vatRate !== null) && closeTo(vatOf(lines), statedVat, tolerance)) return;
  const apply = (rates: (number | null)[]) => { lines.forEach((line, index) => { line.vatRate = rates[index]; if (rates[index] === 0) line.taxClassification = "Zero-rated"; else delete line.taxClassification; }); };
  // VAT box with several rates ("20% on 944.89, 0% on 67.21"): find which lines make up each group.
  const groups = summary.filter((row) => row.rate !== null && row.goods !== null && [0, 5, 20].includes(row.rate)).map((row) => ({ rate: row.rate as number, goods: row.goods as number }));
  if (groups.length >= 2) {
    const trial = lines.map((line) => ({ ...line, vatRate: null as number | null }));
    assignFromVatAnalysis(trial, groups);
    if (trial.every((line) => line.vatRate !== null) && closeTo(vatOf(trial), statedVat, tolerance)) { apply(trial.map((line) => line.vatRate)); return; }
  }
  // One rate for everything (or no VAT at all) that gives exactly the printed VAT.
  const single = statedVat === 0 ? 0 : [20, 5].find((rate) => closeTo(net * rate / 100, statedVat, tolerance));
  if (single !== undefined) { apply(lines.map(() => single)); return; }
  notes.push(`The VAT on the lines (£${vatOf(lines).toFixed(2)}) does not match the VAT printed on the invoice (£${statedVat.toFixed(2)}). Check each line's VAT rate before confirming.`);
}

export function invoiceDraftFromAi(ai: AiInvoice, fileName: string, context: DraftContext = {}): InvoiceDraft {
  const notes: string[] = [];
  const rows = ai.vat_summary.filter((row) => row.rate !== null);
  const byCode = new Map(rows.flatMap((row) => row.code ? [[row.code.toUpperCase(), row.rate as number] as const] : []));
  const onlyRate = new Set(rows.map((row) => row.rate)).size === 1 ? rows[0].rate : null;
  const lines = ai.lines.map((line) => aiLine(line, line.vat_rate ?? (line.vat_code ? byCode.get(line.vat_code.toUpperCase()) : undefined) ?? onlyRate, false));
  const statedVat = ai.vat_total ?? (ai.vat_summary.length && ai.vat_summary.every((row) => row.vat !== null) ? round2(ai.vat_summary.reduce((sum, row) => sum + (row.vat as number), 0)) : null);
  const itemsTotal = lines.reduce((sum, line) => sum + line.netAmount, 0);
  // Receipts include VAT. An invoice does so only if its own figures prove it: the
  // items already equal the total, with VAT charged on top of nothing.
  const inclusive = ai.document_type === "receipt" ? ai.prices_include_vat : ai.prices_include_vat && ai.gross_total !== null && (statedVat ?? 0) > 0 && closeTo(itemsTotal, ai.gross_total, 0.05);
  for (const line of lines) line.inclusive = inclusive;

  if (inclusive) repairOfferPrices(lines, ai.gross_total);
  if (!inclusive) reconcileLineRates(lines, ai.vat_summary, statedVat, notes);
  const paid = round2(lines.reduce((sum, line) => sum + line.netAmount, 0));
  const beforeDiscount = round2(lines.reduce((sum, line) => sum + line.netAmount + (line.discount ?? 0), 0));
  const rated = lines.length > 0 && lines.every((line) => line.vatRate !== null);
  const linesVat = rated ? round2(lines.reduce((sum, line) => { const rate = line.vatRate as number; return sum + line.netAmount * rate / (inclusive ? 100 + rate : 100); }, 0)) : null;
  const summaryVat = ai.vat_summary.length && ai.vat_summary.every((row) => row.vat !== null) ? round2(ai.vat_summary.reduce((sum, row) => sum + (row.vat as number), 0)) : null;
  const tolerance = Math.max(0.05, 0.01 * lines.length);
  const matchesLines = (value: number) => closeTo(value, paid, tolerance) || closeTo(value, beforeDiscount, tolerance);
  // A goods total that disagrees with the lines is not trusted (the model may have
  // worked it out backwards from the amount to pay): the lines are shown instead.
  const statedNet = inclusive ? null : ai.net_total ?? ai.subtotal;
  const linesRule = lines.length > 0 && statedNet !== null && !matchesLines(statedNet);
  const vat = linesRule ? linesVat ?? ai.vat_total ?? summaryVat : ai.vat_total ?? summaryVat ?? linesVat;
  const expected = inclusive ? paid : round2(paid + (vat ?? 0));
  const gross = ai.gross_total ?? (lines.length ? expected : null);
  const net = inclusive ? ai.net_total ?? (gross !== null && vat !== null ? round2(gross - vat) : null) : linesRule ? paid : statedNet ?? (lines.length ? paid : null);

  const totals = lines.length ? totalsWarning(expected, ai.gross_total, lines.length) : null;
  const shown = linesRule ? statedNet : inclusive && lines.length > 0 && ai.subtotal !== null && !matchesLines(ai.subtotal) ? ai.subtotal : null;
  if (totals) notes.push(totals);
  else if (shown !== null) notes.push(`A page or item may be missing: the items come to £${paid.toFixed(2)} but the document shows £${shown.toFixed(2)}.`);

  const vatNumber = (ai.vat_number ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const digits = vatNumber.replace(/^(?:GB|XI)/, "");
  if (vatNumber && (!/^\d{9}(?:\d{3})?$/.test(digits) || !validUkVat(digits))) notes.push(`VAT number ${vatNumber} does not pass the HMRC check digit test. It may have been misread; check it against the original.`);

  const customerName = ai.customer_name ?? "";
  const supplier = ai.supplier_name ?? "";
  const notSupplier = (context.companyName && sameName(supplier, context.companyName)) || (customerName && sameName(supplier, customerName));
  const fields: ExtractedInvoiceFields = {
    supplierName: notSupplier ? "" : supplier, supplierVatNumber: vatNumber, customerName, customerVatNumber: "",
    invoiceNumber: ai.invoice_number ?? "", invoiceDate: pastInvoiceDate(ai.invoice_date, context.today ?? new Date(), notes), dueDate: ai.due_date, currency: "GBP",
    read: { net: ai.net_total, vat: ai.vat_total, gross: ai.gross_total }, net, vat, gross, lines,
    vatNeedsReview: !rated, notes, ...(ai.document_type === "receipt" ? { receipt: true } : {})
  };
  return draftFromFields(fields, fileName, context, ai.page_info);
}
