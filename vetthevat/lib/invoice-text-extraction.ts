// Field extraction from invoice text (digital PDF text or OCR output).
//
// Input text is one line per visual row. Column gaps are tabs (see
// lib/document-text-layout.ts), runs of 2+ spaces, or pipes, so a row such as
// "Mumbai Fusion<TAB>Invoice Date<TAB>26/10/2026" keeps its columns apart.
//
// Rules that must hold:
// - Nothing is invented. A value is either read from the text or derived from
//   other read values by arithmetic (and reported as derived).
// - A missing VAT amount is never treated as 0%. Line rates stay null (needs
//   review) unless the document evidences them.
import { parseInvoiceDate } from "@/lib/invoice-rules";
import { parseDocumentMoney } from "@/lib/invoice-parsing";
import { nameFromWebsite, readReceipt } from "@/lib/receipt-extraction";

export type ExtractedTaxClassification = "Taxable" | "Zero-rated" | "Exempt" | "Out of scope";
export type ExtractedInvoiceLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  netAmount: number;
  vatRate: number | null;
  taxClassification?: ExtractedTaxClassification;
  // Receipts: unitPrice and netAmount include VAT (netAmount is the printed line amount).
  inclusive?: boolean;
  // Money taken off the line (offer / loyalty price); netAmount is after it.
  discount?: number;
};
export type ExtractedInvoiceFields = {
  supplierName: string;
  supplierVatNumber: string;
  customerName: string;
  customerVatNumber: string;
  invoiceNumber: string;
  invoiceDate: string | null;
  dueDate: string | null;
  currency: "GBP" | "EUR" | "USD" | null;
  // Totals exactly as read from the document (after OCR decimal repair).
  read: { net: number | null; vat: number | null; gross: number | null };
  // Best available totals: read values, else derived by arithmetic.
  net: number | null;
  vat: number | null;
  gross: number | null;
  lines: ExtractedInvoiceLine[];
  vatNeedsReview: boolean;
  notes: string[];
  // Set when the document was read as a till receipt (prices include VAT).
  receipt?: boolean;
};
export type ExtractionContext = { companyName?: string; companyVatNumber?: string };

type Row = { text: string; cells: string[] };

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const close = (a: number, b: number, tolerance = 0.011) => Math.abs(a - b) <= tolerance;
const alnum = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const letters = (value: string) => (value.match(/[A-Za-z]/g) ?? []).length;

function toRows(text: string): Row[] {
  return text.replace(/\r/g, "").replace(/ /g, " ").split("\n").map((raw) => {
    const cells = raw.split(/\t+| {2,}|\|/).map((cell) => cell.replace(/\s+/g, " ").trim()).filter((cell) => cell && !/^[^A-Za-z0-9]+$/.test(cell));
    return { cells, text: cells.join(" ") };
  }).filter((row) => row.cells.length);
}

// ---------------------------------------------------------------- dates

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DATE = "\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}[/.\\-]\\d{1,2}[/.\\-]\\d{2,4}|\\d{1,2}(?:st|nd|rd|th)?[\\s\\-/.]+[A-Za-z]{3,9}\\.?,?[\\s\\-/.]+\\d{2,4}|[A-Za-z]{3,9}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}";

function calendarDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1900 && year <= 2100 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.toISOString().slice(0, 10) : null;
}

// UK day-first dates in the formats invoices actually use: 26/10/2026,
// 26-10-26, 2026-10-26, 26 Oct 2026, 26th October 2026, 26-Oct-26, Oct 26, 2026.
export function parseFlexibleDate(value: string): string | null {
  const trimmed = value.trim();
  const direct = parseInvoiceDate(trimmed) ?? parseInvoiceDate(trimmed.replace(/-/g, "/"));
  if (direct) return direct;
  const cleaned = trimmed.replace(/(\d)(?:st|nd|rd|th)\b/gi, "$1");
  const dayFirst = cleaned.match(/^(\d{1,2})[\s\-/.,]+([A-Za-z]{3,9})[\s\-/.,]+(\d{2}|\d{4})$/);
  if (dayFirst) return calendarDate(Number(dayFirst[3]) + (dayFirst[3].length === 2 ? 2000 : 0), MONTHS.indexOf(dayFirst[2].slice(0, 3).toLowerCase()) + 1, Number(dayFirst[1]));
  const monthFirst = cleaned.match(/^([A-Za-z]{3,9})[\s.,]+(\d{1,2})[\s,]+(\d{4})$/);
  if (monthFirst) return calendarDate(Number(monthFirst[3]), MONTHS.indexOf(monthFirst[1].slice(0, 3).toLowerCase()) + 1, Number(monthFirst[2]));
  return null;
}

const acceptDate = (candidate: string) => {
  const match = candidate.match(new RegExp(`^[\\s:#.\\-]*(${DATE})`, "i"));
  if (match) return parseFlexibleDate(match[1]);
  // OCR can lose the slashes ("26102026") or read them as 1/l/I ("2611012026").
  // Only accepted directly after a date label, and only for a real calendar date.
  const damaged = candidate.match(/^[\s:#.\-]*(\d{2})[1lI|]?(\d{2})[1lI|]?((?:19|20)\d{2})(?!\d)/);
  return damaged ? calendarDate(Number(damaged[3]), Number(damaged[2]), Number(damaged[1])) : null;
};

// ---------------------------------------------------------------- labelled values

// Finds "Label value" in one cell, "Label | value" in adjacent cells, or a
// label with its value directly underneath (same column, next row).
function findLabelled<T>(rows: Row[], source: string, accept: (candidate: string) => T | null): T | null {
  const label = new RegExp(`(?<![A-Za-z])(?:${source})(?![A-Za-z])`, "i");
  for (let r = 0; r < rows.length; r++) {
    const cells = rows[r].cells;
    for (let c = 0; c < cells.length; c++) {
      const match = label.exec(cells[c]);
      if (!match) continue;
      const rest = cells[c].slice(match.index + match[0].length);
      const candidates: (string | undefined)[] = [rest, cells[c + 1]];
      if (!rest.replace(/[\s:#.\-]/g, "")) {
        const below = rows[r + 1]?.cells;
        if (below) candidates.push(below[c], below[0]);
      }
      for (const candidate of candidates) {
        if (!candidate) continue;
        const value = accept(candidate);
        if (value !== null) return value;
      }
    }
  }
  return null;
}

const firstLabelled = <T>(rows: Row[], sources: string[], accept: (candidate: string) => T | null) => {
  for (const source of sources) {
    const value = findLabelled(rows, source, accept);
    if (value !== null) return value;
  }
  return null;
};

function acceptReference(strict: boolean) {
  return (raw: string) => {
    // OCR may add a space after a separator: "QVKUK/26-27/ 1390".
    const candidate = raw.replace(/([A-Za-z0-9][/-])\s+(?=[A-Za-z0-9])/g, "$1");
    const match = candidate.match(/^[\s:#.\-]*([A-Z0-9][A-Z0-9/._-]{0,29})(?![A-Za-z0-9])/i);
    const token = match?.[1].replace(/[/._-]+$/, "");
    // A money amount ("1201.08") is never an invoice number.
    if (token && /^\d{1,3}(?:,\d{3})*\.\d{2}$|^\d+\.\d{2}$/.test(token)) return null;
    if (!token || !/\d/.test(token) || parseFlexibleDate(token)) return null;
    if (strict && (token.match(/\d/g) ?? []).length < 3) return null;
    return token;
  };
}

// ---------------------------------------------------------------- totals

const CUR = "(?:\\(?(?:GBP|EUR|USD|[£€$]|\\b[Ef](?=\\d))\\)?\\s*)?";
const DEC = "\\(?-?(?:\\d{1,3}(?:,\\d{3})+|\\d+)[.,]\\d{2}\\)?";
const WHOLE_AT_END = "\\(?-?\\d+\\)?(?=\\s*$)";
const NOT_MORE = "(?![\\d.,]|\\s*%)";

type TotalKind = "net" | "vat" | "gross";
type TotalLabel = { kind: TotalKind; rank: number; source: string; weak?: boolean };
type TotalHit = { kind: TotalKind; rank: number; value: number; rate: number | null; repairable: boolean; row: number };

// Order matters: specific phrases are consumed before the bare words they contain.
const TOTAL_LABELS: TotalLabel[] = [
  { kind: "net", rank: 1, source: "sub[\\s-]*total|net\\s+(?:amount|total|value)|total\\s+net|total\\s+(?:excl?\\w*\\.?|ex\\.?|before)\\s+(?:vat|tax)|(?:amount|total)\\s+exc\\w*\\.?\\s+(?:vat|tax)|goods(?:\\s+(?:total|value|net))?|total\\s+goods|taxable\\s+(?:amount|value)|recorded\\s+net" },
  { kind: "vat", rank: 1, source: "(?:total\\s+)?(?:vat|v\\.a\\.t\\.?|sales\\s+tax|gst)\\s+(?:amount|total)|total\\s+(?:vat|v\\.a\\.t\\.?|tax)|tax\\s+(?:amount|total)" },
  { kind: "gross", rank: 2, source: "total\\s+(?:payable|due|to\\s+pay)|amount\\s+(?:due|payable|to\\s+pay)|balance\\s+due|outstanding\\s+balance|please\\s+pay" },
  { kind: "gross", rank: 1, source: "invoice\\s+total|grand\\s+total|gross(?:\\s+(?:total|amount))?|total\\s+(?:inc\\w*\\.?(?:\\s+(?:of\\s+)?(?:vat|tax))?|amount)|totals?" },
  { kind: "net", rank: 2, weak: true, source: "net" },
  { kind: "vat", rank: 2, weak: true, source: "vat|v\\.a\\.t\\.?|tax|gst" }
];
const TOTAL_PATTERNS = TOTAL_LABELS.map((label) => {
  const amount = label.weak ? DEC : `${DEC}|${WHOLE_AT_END}`;
  return {
    label,
    pattern: new RegExp(`(?<![A-Za-z])(?:${label.source})(?![A-Za-z])\\s*(?:\\(?\\s*(?:@|at)?\\s*(\\d{1,2}(?:\\.\\d{1,2})?)\\s*%\\s*\\)?)?(?:\\s*on\\s+${CUR}${DEC})?[\\s:=.]*${CUR}(${amount})${NOT_MORE}(?:\\s+${CUR}(${amount})${NOT_MORE})*`, "i")
  };
});
const LABEL_AT_END = new RegExp(`(?<![A-Za-z])(?:${TOTAL_LABELS.filter((label) => !label.weak).map((label) => label.source).join("|")})\\s*:?\\s*$`, "i");
const AMOUNT_ONLY = new RegExp(`^${CUR}(?:${DEC}|\\d+)$`, "i");

function readTotals(rows: Row[]) {
  const hits: TotalHit[] = [];
  const totalRows = new Set<number>();
  for (let r = 0; r < rows.length; r++) {
    let text = rows[r].text;
    // "Sub Total" on one row with the amount alone on the next.
    if (LABEL_AT_END.test(text) && rows[r + 1] && AMOUNT_ONLY.test(rows[r + 1].text)) { text = `${text} ${rows[r + 1].text}`; totalRows.add(r + 1); }
    for (const { label, pattern } of TOTAL_PATTERNS) {
      for (let guard = 0; guard < 4; guard++) {
        const match = pattern.exec(text);
        if (!match) break;
        const raw = match[3] ?? match[2];
        const value = parseDocumentMoney(raw);
        text = `${text.slice(0, match.index)} ~ ${text.slice(match.index + match[0].length)}`;
        if (value === null) continue;
        hits.push({ kind: label.kind, rank: label.rank, value, rate: match[1] === undefined ? null : Number(match[1]), repairable: !/[.,]/.test(raw) && raw.replace(/\D/g, "").length >= 3, row: r });
        totalRows.add(r);
      }
    }
  }
  // Amount due printed under its heading ("PLEASE PAY" / "GBP 404.30"). Only
  // payable-type labels: a "Total" column heading has line amounts under it.
  const payable = new RegExp(`^(?:${TOTAL_LABELS.filter((label) => label.kind === "gross" && label.rank === 2).map((label) => label.source).join("|")})\\s*:?$`, "i");
  for (let r = 0; r + 1 < rows.length; r++) rows[r].cells.forEach((cell, c) => {
    if (!payable.test(cell)) return;
    // Up to three letters before the amount: currency, or currency misread ("EP 404.30" for "GBP 404.30").
    const amount = new RegExp(`^(?:${CUR}|[A-Za-z]{1,3}\\s*)(${DEC})$`, "i");
    // Same column on the next row; in a sparse reading (columns interleaved), the first amount-only line within six.
    let below = rows[r + 1].cells[c]?.match(amount);
    for (let next = r + 1; !below && next <= Math.min(rows.length - 1, r + 6); next++) if (rows[next].cells.length === 1) below = rows[next].text.match(amount);
    const value = below ? parseDocumentMoney(below[1]) : null;
    if (value !== null) { hits.push({ kind: "gross", rank: 2, value, rate: null, repairable: false, row: r }); totalRows.add(r); totalRows.add(r + 1); }
  });
  readVatSummary(rows, hits, totalRows);
  return { hits, totalRows };
}

// "Rate  Net  VAT  Gross" header followed by rows of figures.
function readVatSummary(rows: Row[], hits: TotalHit[], totalRows: Set<number>) {
  for (let r = 0; r < rows.length; r++) {
    if (/\d/.test(rows[r].text)) continue;
    const tokens = rows[r].text.toLowerCase()
      .replace(/(?:vat|tax)\s*(?:rate|%|code)|rate|code|%/g, " @rate ").replace(/sub\s*total|net|goods/g, " @net ").replace(/vat|tax/g, " @vat ").replace(/gross|total/g, " @gross ")
      .replace(/amount|value|gbp|£|[()]/g, " ").split(/\s+/).filter(Boolean);
    const kinds = tokens.filter((token) => token !== "@rate").map((token) => token.slice(1)) as TotalKind[];
    if (!tokens.every((token) => token.startsWith("@")) || kinds.length < 2 || !kinds.includes("vat") || new Set(kinds).size !== kinds.length) continue;
    const sums = new Map<TotalKind, number>();
    let found = false;
    for (let next = r + 1; next < Math.min(rows.length, r + 9); next++) {
      const amounts = (rows[next].text.match(new RegExp(DEC + NOT_MORE, "g")) ?? []).map((raw) => parseDocumentMoney(raw));
      if (amounts.length !== kinds.length || amounts.some((amount) => amount === null)) break;
      const isTotal = /^total/i.test(rows[next].text);
      kinds.forEach((kind, index) => sums.set(kind, isTotal ? amounts[index]! : round2((sums.get(kind) ?? 0) + amounts[index]!)));
      totalRows.add(next); found = true;
      if (isTotal) break;
    }
    if (!found) continue;
    totalRows.add(r);
    for (const [kind, value] of sums) hits.push({ kind, rank: 3, value, rate: null, repairable: false, row: r });
  }
}

function resolveTotals(hits: TotalHit[], linesNet: number | null, notes: string[]) {
  const best = (kind: TotalKind) => {
    const all = hits.filter((hit) => hit.kind === kind);
    const rank = Math.min(...all.map((hit) => hit.rank));
    return all.filter((hit) => hit.rank === rank);
  };
  const netHit = best("net").at(-1) ?? null;
  const vatHits = best("vat");
  let vat: number | null = vatHits.at(-1)?.value ?? null;
  let vatRepairable = vatHits.at(-1)?.repairable ?? false;
  // Separate "VAT @ 20%" and "VAT @ 5%" rows with no overall VAT total: add them up.
  const rated = vatHits.filter((hit) => hit.rate !== null);
  if (vatHits.length > 1 && vatHits[0].rank === 2 && rated.length === vatHits.length && new Set(rated.map((hit) => hit.rate)).size === rated.length) { vat = round2(rated.reduce((sum, hit) => sum + hit.value, 0)); vatRepairable = false; }
  const grossHits = hits.filter((hit) => hit.kind === "gross");
  let net = netHit?.value ?? null;
  // OCR often drops the decimal point ("21250" for "212.50"). Repair a whole
  // number only when the repaired value agrees with other figures on the page.
  const reference = [linesNet, ...hits.filter((hit) => !hit.repairable).map((hit) => hit.value)].filter((value): value is number => value !== null);
  const repair = (value: number | null, repairable: boolean, agrees: (candidate: number) => boolean) => {
    if (value === null || !repairable || !agrees(value / 100) || agrees(value)) return value;
    if (!notes.includes(DECIMAL_NOTE)) notes.push(DECIMAL_NOTE);
    return value / 100;
  };
  const known = (candidate: number) => reference.some((value) => close(value, candidate));
  net = repair(net, netHit?.repairable ?? false, known);
  vat = repair(vat, vatRepairable, (candidate) => net !== null && grossHits.some((hit) => close(net! + candidate, hit.value) || close(net! + candidate, hit.value / 100)));
  const grossValues = grossHits.map((hit) => ({ ...hit, value: repair(hit.value, hit.repairable, (candidate) => known(candidate) || (net !== null && close(net + (vat ?? 0), candidate)))! }));
  const expected = net !== null && vat !== null ? net + vat : null;
  const grossRank = Math.min(...grossValues.map((hit) => hit.rank));
  const gross = (expected !== null ? grossValues.find((hit) => close(hit.value, expected)) : undefined)?.value ?? grossValues.filter((hit) => hit.rank === grossRank).at(-1)?.value ?? null;
  return { net, vat, gross };
}

const DECIMAL_NOTE = "Some amounts were read without a decimal point and corrected using the invoice arithmetic. Check them against the original.";

// ---------------------------------------------------------------- line items

type TableContext = { inTable: boolean; order: string[]; hasVatColumn: boolean; moneyDecimals: boolean; expectedIndex: number };
type NumberToken = { value: number; raw: string; hasDecimal: boolean; repairable: boolean; currency: boolean };

const UNIT = /^(?:kg|kgs|g|gm|gms|ltr|ltrs|lit|l|ml|cl|ea|each|pcs?|box|boxes|case|cases|cs|ctn|ctns|carton|cartons|btl|btls|bottles?|tray|trays|bags?|tins?|jars?|rolls?|doz|dozen|pk|pack|packs|unit|units|nos?|hrs?|hours?|days?|x|@)$/i;
const NUMBER = /^\(?-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:[.,]\d{1,4})?\)?$/;
const VAT_CODES: Record<string, { rate: number; classification?: ExtractedTaxClassification }> = {
  S: { rate: 20 }, STD: { rate: 20 }, T1: { rate: 20 }, R: { rate: 5 }, T5: { rate: 5 },
  Z: { rate: 0, classification: "Zero-rated" }, ZERO: { rate: 0, classification: "Zero-rated" }, T0: { rate: 0, classification: "Zero-rated" },
  E: { rate: 0, classification: "Exempt" }, EXEMPT: { rate: 0, classification: "Exempt" }, T2: { rate: 0, classification: "Exempt" },
  T9: { rate: 0, classification: "Out of scope" }
};
const HEADER_WORDS: [string, RegExp][] = [
  ["desc", /^(?:description|item|items|product|products|details|particulars|activity|service|services|goods)$/],
  ["qty", /^(?:qty|quantity|qnty|units|hours|hrs|pcs|nos)$/],
  ["price", /^(?:rate|price|cost|each)$/],
  ["vat", /^(?:vat|tax|vc)$/],
  ["disc", /^(?:disc|discount)$/],
  ["amount", /^(?:amount|total|net|value|gross|ext|extended)$/]
];
const NOT_AN_ITEM = /^total\b|\btotal\s+(?:qty|quantity|items?)\b|(?:invoice|grand|sub)\s*total\b|\b(?:invoice\s*(?:#|no\b|number|date)|due\s+date|bill\s+to|ship\s+to|deliver\s+to|vat\s+(?:reg|no\b|number)|sort\s+code|short\s+code|account\s+(?:no\b|number|name)|iban|swift|carried\s+forward|brought\s+forward|page\s+\d|tel\b|phone|payment\s+terms|thanks?\s+(?:for|you))/i;
// Also anywhere in the row: OCR often misreads the first word of a boxed footer ("Cod VAT Analysis Bank Details").
const TABLE_END = /^(?:payment|bank|notes?\b|terms\b|thank|vat\s+(?:summary|analysis|breakdown)|e\s*&\s*o\s*e)|\bvat\s+(?:summary|analysis|breakdown)\b|\bbank\s+details\b/i;

function headerOrder(row: Row): string[] | null {
  if (row.text.length > 140 || /\d[.,]\d{2}/.test(row.text)) return null;
  const order: string[] = [];
  for (const word of row.text.toLowerCase().replace(/unit\s*(?:price|cost|rate)/g, "price").replace(/line\s*total/g, "amount").match(/[a-z]+/g) ?? []) {
    const role = HEADER_WORDS.find(([, pattern]) => pattern.test(word))?.[0];
    if (role && order.at(-1) !== role) order.push(role);
  }
  const roles = new Set(order);
  const core = ["desc", "qty", "price", "amount"].filter((role) => roles.has(role)).length;
  return core >= 3 || (core === 2 && (roles.has("qty") || roles.has("price")) && roles.has("amount")) ? order : null;
}

function numberToken(raw: string, currency: boolean): NumberToken | null {
  const stripped = raw.replace(/^[£€$]/, "");
  if (!NUMBER.test(stripped)) return null;
  const value = parseDocumentMoney(stripped);
  if (value === null) return null;
  const hasDecimal = /[.,]\d{1,4}\)?$/.test(stripped) && !/^\(?-?\d{1,3}(?:,\d{3})+\)?$/.test(stripped);
  return { value, raw: stripped, hasDecimal, repairable: !hasDecimal && stripped.replace(/\D/g, "").length >= 3, currency: currency || stripped !== raw };
}

// Tables printed "Code | Qty | Description | Unit | Pack | Unit Price | Value":
// the quantity is the number column before the description, not after it.
function parseQtyFirstRow(row: Row, table: TableContext): ExtractedInvoiceLine | null {
  const qtyAt = table.order.indexOf("qty"), descAt = table.order.indexOf("desc");
  if (!table.inTable || qtyAt < 0 || descAt < qtyAt || row.cells.length < 4) return null;
  let cells = [...row.cells], vatRate: number | null = null, classification: ExtractedTaxClassification | undefined;
  const code = VAT_CODES[cells[cells.length - 1].toUpperCase()];
  if (code && table.hasVatColumn) { vatRate = code.rate; classification = code.classification; cells = cells.slice(0, -1); }
  let descIndex = -1;
  cells.forEach((cell, index) => { if (letters(cell) >= 3 && (descIndex < 0 || letters(cell) > letters(cells[descIndex]))) descIndex = index; });
  if (descIndex < 1) return null;
  const quantity = [...cells.slice(0, descIndex)].reverse().map(cell => cell.match(/^\d{1,5}(?:\.\d{1,3})?$/) ? Number(cell) : null).find(value => value !== null);
  // "154.99 154.99": OCR may merge the price and amount columns into one cell.
  const after = cells.slice(descIndex + 1).flatMap(cell => cell.split(" ")).map(cell => numberToken(cell, false)).filter((token): token is NumberToken => token !== null);
  if (!quantity || after.length < 2) return null;
  const amount = after[after.length - 1], price = after[after.length - 2];
  if (!amount.hasDecimal || !close(quantity * price.value, amount.value, 0.011)) return null;
  return { description: cells[descIndex].replace(/^[^A-Za-z0-9(]+/, "").slice(0, 200), quantity, unitPrice: price.value, netAmount: round2(amount.value), vatRate, ...(classification ? { taxClassification: classification } : {}) };
}

function parseItemRow(row: Row, table: TableContext, notes: string[]): ExtractedInvoiceLine | null {
  if (NOT_AN_ITEM.test(row.text)) return null;
  const columns = parseQtyFirstRow(row, table);
  if (columns) return columns;
  const tokens = row.text.split(" ");
  const numbers: NumberToken[] = [];
  let rate: number | null = null, classification: ExtractedTaxClassification | undefined, percentNext = false, currencyNext = false;
  let index = tokens.length - 1;
  for (; index >= 0; index--) {
    const token = tokens[index];
    if (/^(?:[£€$]|GBP|EUR|USD)$/i.test(token)) { if (numbers[0]) numbers[0].currency = true; else currencyNext = true; continue; }
    if (token === "%") { percentNext = true; continue; }
    const percent = token.match(/^(\d{1,2}(?:[.,]\d{1,2})?)%$/);
    if (percent || (percentNext && /^\d{1,2}(?:[.,]\d{1,2})?$/.test(token))) { if (rate === null) rate = Number((percent?.[1] ?? token).replace(",", ".")); percentNext = false; continue; }
    const code = VAT_CODES[token.toUpperCase()];
    // "20.0% S": a VAT code right after a printed rate counts even when the table heading was misread.
    const afterRate = /^\d{1,2}(?:[.,]\d{1,2})?%$/.test(tokens[index - 1] ?? "");
    if (code && (table.hasVatColumn || afterRate) && rate === null && classification === undefined && (token.length > 1 || index === tokens.length - 1 || numbers.length > 0)) { rate = code.rate; classification = code.classification; continue; }
    // A VAT code this parser does not know ("64.92 12.98 AB 77.90"), between two figures in a table with a VAT column.
    if (table.hasVatColumn && /^[A-Z]{1,3}$/.test(token) && numbers.length && index > 0 && numberToken(tokens[index - 1], false)) continue;
    const number = numberToken(token, currencyNext);
    if (number) { numbers.unshift(number); currencyNext = false; continue; }
    if (UNIT.test(token) && numbers.length && index > 0 && numberToken(tokens[index - 1], false)) continue;
    break;
  }
  if (!numbers.length) return null;
  let front = tokens.slice(0, index + 1);

  let quantity: number | null = null, unitPrice: number | null = null, net: number | null = null, repaired = false;
  const multiply = (a: number, b: number, c: number) => close(a * b, c);
  // Columns: find quantity x price = amount among the trailing numbers.
  search: for (const allowRepair of [false, true]) {
    for (let i = 0; i < numbers.length - 2; i++) for (let j = i + 1; j < numbers.length - 1; j++) for (let k = j + 1; k < numbers.length; k++) {
      const options = (n: NumberToken) => allowRepair && n.repairable ? [n.value, n.value / 100] : [n.value];
      for (const a of options(numbers[i])) for (const b of options(numbers[j])) for (const c of options(numbers[k])) {
        if (a <= 0 || b <= 0 || c <= 0 || !multiply(a, b, c)) continue;
        let q = a, p = b, n = c;
        // "1.00  1200  1200": both money columns lost their decimal point.
        if (table.moneyDecimals && numbers[k].repairable && c === numbers[k].value && numbers[j].repairable && b === numbers[j].value) { p = b / 100; n = c / 100; repaired = true; }
        if (a !== numbers[i].value || b !== numbers[j].value || c !== numbers[k].value) repaired = true;
        const priceFirst = table.order.includes("price") && table.order.includes("qty") ? table.order.indexOf("price") < table.order.indexOf("qty") : numbers[i].currency && !numbers[j].currency;
        if (priceFirst) [q, p] = [p, q];
        quantity = q; unitPrice = p; net = n;
        front = [...front, ...numbers.slice(0, i).map((n2) => n2.raw)];
        // A remaining figure may be the VAT rate, or the VAT amount for the line.
        if (rate === null) for (const [position, extra] of numbers.entries()) {
          if (position <= j || position === k) continue;
          if (table.hasVatColumn && position < k && [0, 5, 20].includes(extra.value)) { rate = extra.value; break; }
          if (position > k && extra.value > 0) { const implied = Math.round(extra.value / n * 1000) / 10; if (implied === 20 || implied === 5) { rate = implied; break; } }
          if (position > k && extra.value === 0 && table.hasVatColumn && extra.hasDecimal) { rate = 0; break; }
        }
        break search;
      }
    }
  }
  if (net === null) {
    const leading = front[0]?.match(/^(\d+(?:\.\d+)?)[x×]?$/);
    const marker = Boolean(leading) && (/[x×]$/.test(front[0]) || /^[x×]$/.test(front[1] ?? ""));
    const last = numbers.at(-1)!, first = numbers[0];
    if (leading && numbers.length >= 2 && (table.inTable || marker) && multiply(Number(leading[1]), first.value, last.value)) {
      // "2 x Cabbage @ 8.00 16.00"
      quantity = Number(leading[1]); unitPrice = first.value; net = last.value; front = front.slice(marker && /^[x×]$/.test(front[1] ?? "") ? 2 : 1);
    } else if (!table.inTable) return null;
    else if (numbers.length >= 2) {
      const a = numbers.at(-2)!;
      const ratio = a.value > 0 ? Math.round(last.value / a.value * 1000) / 1000 : 0;
      if (a.value === last.value) { quantity = 1; unitPrice = last.value; net = last.value; }
      else if (ratio === 1.2 || ratio === 1.05) { quantity = 1; unitPrice = a.value; net = a.value; if (rate === null) rate = ratio === 1.2 ? 20 : 5; }
      else if (table.order.includes("qty") && !table.order.includes("price") && a.value > 0) { quantity = a.value; unitPrice = Math.round(last.value / a.value * 10000) / 10000; net = last.value; }
      else { quantity = 1; unitPrice = last.value; net = last.value; }
      front = [...front, ...numbers.slice(0, -2).map((n) => n.raw)];
    } else if (last.hasDecimal) { quantity = 1; unitPrice = last.value; net = last.value; }
    else return null;
  }
  if (quantity === null || unitPrice === null || net === null || quantity <= 0 || unitPrice <= 0 || net <= 0) return null;
  // Leading row number ("7 Spinach ...").
  if (front.length > 1 && /^\d{1,3}[.)]?$/.test(front[0]) && (Number.parseInt(front[0], 10) === table.expectedIndex || table.order[0] !== "qty" && table.inTable && Number.parseInt(front[0], 10) <= 999 && front[0].length <= 2)) front = front.slice(1);
  const description = front.join(" ").replace(/^[^A-Za-z0-9(]+|[^A-Za-z0-9)%.]+$/g, "").replace(/\s+@$/, "").trim().slice(0, 200);
  if (letters(description) < 2) return null;
  if (repaired && !notes.includes(DECIMAL_NOTE)) notes.push(DECIMAL_NOTE);
  return { description, quantity, unitPrice: Math.round(unitPrice * 10000) / 10000, netAmount: round2(net), vatRate: rate, ...(classification ? { taxClassification: classification } : {}) };
}

function readLines(rows: Row[], totalRows: Set<number>, notes: string[]): ExtractedInvoiceLine[] {
  const lines: ExtractedInvoiceLine[] = [];
  const table: TableContext = { inTable: false, order: [], hasVatColumn: false, moneyDecimals: false, expectedIndex: 1 };
  let lastItemRow = -2;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const order = headerOrder(row);
    if (order) {
      table.inTable = true; table.order = order; table.hasVatColumn = order.includes("vat"); table.expectedIndex = 1;
      // Does this table print money with decimals? Used to spot dropped decimal points.
      let decimals = 0, whole = 0;
      for (let next = r + 1; next < rows.length && !totalRows.has(next) && !headerOrder(rows[next]); next++) {
        const last = rows[next].text.split(" ").at(-1) ?? "";
        if (/^[£€$]?\d[\d,]*[.,]\d{2}$/.test(last)) decimals++; else if (/^[£€$]?\d{3,}$/.test(last)) whole++;
      }
      table.moneyDecimals = decimals >= 2 && decimals >= whole;
      continue;
    }
    // A VAT analysis row ("AB 20.00 % 127.02 25.40") is not an item.
    if (totalRows.has(r) || TABLE_END.test(row.text) || readVatAnalysis([row]).length) { table.inTable = false; continue; }
    const line = parseItemRow(row, table, notes);
    if (line) { lines.push(line); lastItemRow = r; table.expectedIndex++; continue; }
    // Wrapped description: a text-only row directly under an item.
    if (table.inTable && lastItemRow === r - 1 && lines.length && !/\d[.,]\d{2}|:/.test(row.text) && row.text.length <= 80 && letters(row.text) >= 3 && !NOT_AN_ITEM.test(row.text)) {
      const previous = lines.at(-1)!;
      previous.description = `${previous.description} ${row.text}`.slice(0, 200);
      lastItemRow = r;
    }
  }
  return lines;
}

// ---------------------------------------------------------------- parties

const COMPANY_SUFFIX = /\b(?:limited|ltd|plc|llp|llc|inc|corp|gmbh)\b\.?/i;
const TRADE_WORD = /\b(?:company|co|group|traders?|trading|wholesale(?:rs)?|cash\s*&\s*carry|foods?|supplies|services|enterprises?|sons|bros|stores?|supermarket|market|produce|butchers?|bakery|farm|farms)\b/i;
const BANK = /\b(?:bank|hsbc|barclays|natwest|lloyds|santander|monzo|starling|nationwide|sort\s*code|short\s*code|iban|bic|swift)\b/i;
const NOT_A_NAME = /\b(?:invoices?|sales|statement|remittance|pro\s*-?\s*forma|delivery\s+note|credit\s+note|purchase\s+order|bill\s*to|ship\s*to|deliver|date|vat|due|total|page|account|tel|phone|mobile|fax|email|e-mail|www|http|statement|receipt|copy|original|terms|reference|order|description|qty|quantity|amount|customer|united\s+kingdom|england|scotland|wales)\b|@|\.co\.uk|\.com/i;
const CUSTOMER_LABELS = [
  "bil+(?:ed|ing)?\\s*to|invoiced?\\s*to|sold\\s*to|charge\\s*to",
  "customer(?:\\s+name)?(?!\\s*(?:no\\b|number|ref|id\\b|vat|account|a/c|code|po\\b|order|service|copy|signature))|client(?:\\s+name)?",
  "deliver(?:ed|y)?\\s*to|ship(?:ped|ping)?\\s*to",
  "name\\s*(?:&|and)\\s*address"
];
const NEXT_LABEL = /\s+(?=(?:invoice|inv|date|due|terms|account|order|ref|reference|vat|tel|phone|email|page|po)\b)/i;

function cleanName(value: string) {
  let name = value
    // Strip leading bank and payment prefixes (e.g. "Bank Details: Nat West, ", "Payee: ", "Cheques payable to: ")
    .replace(/^(?:(?:bank|account|banking|payment|remittance)\s+details?(?:\s*[:#\-–]\s*|\s+))?(?:nat\s*west|barclays|hsbc|lloyds|santander|rbs|bank|halifax|metro\s+bank)?[,\s\-–:]*/i, "")
    .replace(/^(?:account\s+(?:name|no|number)|a\/c\s+(?:name|no)?|payee(?:\s+name)?|make\s+payable\s+to|cheques?\s+payable\s+to|beneficiary(?:\s+name)?)\s*[:#\-–]?\s*/i, "")
    .replace(/^(?:(?:account\s+)?name|supplier|vendor|seller|from|company|customer|client|sold\s+by|issued\s+by)\s*[:#\-–]\s*/i, "")
    .split(NEXT_LABEL)[0];
  const suffix = COMPANY_SUFFIX.exec(name);
  if (suffix) name = name.slice(0, suffix.index + suffix[0].length);
  // Logo text read ahead of the printed name: "R K RK FRUITS ..." -> "RK FRUITS ...".
  const split = name.match(/^((?:[A-Za-z]\s+){1,4})([A-Za-z]{2,})\b/);
  if (split && alnum(split[1]) === alnum(split[2]).slice(0, alnum(split[1]).length)) name = name.slice(split[1].length);
  // Normalize spacing around parentheses (e.g. "Temple Wines(Cash & Carry) Ltd" -> "Temple Wines (Cash & Carry) Ltd")
  name = name.replace(/\s*\(\s*/g, " (").replace(/\s*\)\s*/g, ") ");
  // "Invoice To" and "Ship To" columns merged by OCR: "ACME LTD ACME LTD" -> "ACME LTD".
  const words = name.trim().split(/\s+/);
  if (words.length >= 2 && words.length % 2 === 0 && words.slice(0, words.length / 2).join(" ").toLowerCase() === words.slice(words.length / 2).join(" ").toLowerCase()) name = words.slice(0, words.length / 2).join(" ");
  return name.replace(/^[^A-Za-z0-9]+|[,:;|\s\-–]+$/g, "").replace(/\s+/g, " ").trim();
}
const usableName = (value: string) => value.length >= 2 && value.length <= 100 && letters(value) >= 2 && !parseFlexibleDate(value);
const sameParty = (a: string, b: string) => { const x = alnum(a), y = alnum(b); return Boolean(x && y) && (x === y || (x.length >= 6 && y.length >= 6 && (x.includes(y) || y.includes(x)))); };

function readCustomer(rows: Row[]) {
  for (const source of CUSTOMER_LABELS) {
    // Anchored to the start of a cell so prose ("...invoice to create...") is not a label.
    const label = new RegExp(`^[^A-Za-z0-9]*(?:${source})(?![A-Za-z])\\s*[:#\\-–]?\\s*`, "i");
    for (let r = 0; r < rows.length; r++) {
      const cells = rows[r].cells;
      for (let c = 0; c < cells.length; c++) {
        const match = label.exec(cells[c]);
        if (!match) continue;
        // Same cell ("Customer: X"), the next column ("Customer: | X"), then below.
        const candidates = [cells[c].slice(match.index + match[0].length), cells[c + 1]];
        // The name sits under the label, in the same column.
        for (const below of [rows[r + 1]?.cells, rows[r + 2]?.cells]) if (below) candidates.push(below[Math.min(c, below.length - 1)]);
        for (const candidate of candidates) {
          // Another label ("Delivery To:", "Invoice Number:") is not a name.
          if (!candidate || /:\s*$/.test(candidate) || /\b(?:supplier|reference|ref|number|no\.?|account|code)\b/i.test(candidate) && !COMPANY_SUFFIX.test(candidate) || CUSTOMER_LABELS.some(source => new RegExp(`^\\W*(?:${source})\\W*$`, "i").test(candidate))) continue;
          const name = cleanName(candidate ?? "");
          if (usableName(name) && letters(name) >= 3 && !NOT_A_NAME.test(name) && !/^\d/.test(name)) return { name, row: r };
        }
      }
    }
  }
  return { name: "", row: -1 };
}

const FREE_MAIL = /^(?:gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|icloud|me|aol|btinternet|btopenworld|sky|talktalk|virginmedia|ntlworld|mail|protonmail|zoho|gmx)$/i;
// "info@templewines.co.uk" / "www.templewines.co.uk" -> "templewines".
// Every distinct domain stem in the page header, most frequent first (OCR may
// misread one copy: "info@remplewines" next to "www.templewines").
function domainStems(rows: Row[]) {
  const counts = new Map<string, number>();
  for (const row of rows.slice(0, 24)) {
    for (const match of row.text.replace(/(www\.|@)\s+/gi, "$1").matchAll(/(?:@|www\.|https?:\/\/)([a-z0-9][a-z0-9-]{2,40})\.(?:co\.uk|org\.uk|ltd\.uk|com|uk|net|org|biz|eu)\b/gi)) {
      const stem = match[1].toLowerCase().replace(/[^a-z0-9]/g, "");
      if (stem.length >= 4 && !FREE_MAIL.test(match[1])) counts.set(stem, (counts.get(stem) ?? 0) + 1);
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1]).map(([stem]) => stem);
}

function readSupplier(rows: Row[], customer: string, context: ExtractionContext, tableStart: number) {
  const excluded = (name: string) => sameParty(name, customer) || sameParty(name, context.companyName ?? "");
  for (const row of rows) for (const cell of row.cells) {
    const match = cell.match(/^(?:supplier|vendor|seller|sold\s+by|issued\s+by|from)(?:\s+name)?\s*[:\-–]\s*(.{2,100})$/i);
    const name = match ? cleanName(match[1]) : "";
    if (name && usableName(name)) return name;
  }
  // The supplier's own website / email domain is printed as plain text even
  // when the name itself is a stylised logo OCR cannot read ("templewines").
  for (const stem of domainStems(rows)) {
    const contains = (value: string) => alnum(value).includes(stem);
    // A full legal name elsewhere on the page that contains it ("Temple Wines
    // (Cash & Carry) Ltd" in bank details, "property of ..." in the terms).
    for (const row of rows) for (const cell of row.cells) {
      const sentence = cell.match(/(?:property\s+of|payable\s+to|account\s+name\s*:?|a\/c\s+name\s*:?)\s+(.{3,90}?)(?:,|\s+until\b|\s+unless\b|\.(?:\s|$)|$)/i)?.[1];
      for (const candidate of [sentence, ...cell.split(/,\s*/)]) {
        if (!candidate || !COMPANY_SUFFIX.test(candidate) || !contains(candidate)) continue;
        const name = cleanName(candidate);
        if (usableName(name) && !excluded(name) && !BANK.test(name)) return name;
      }
    }
    // Otherwise rebuild it from the letterhead words that spell the domain
    // ("TEMPLE" + "wines"), plus a trade line printed under the logo.
    // Logo words sit in one column on separate rows, with other columns'
    // text between them in reading order, so they need not be adjacent.
    const words = rows.slice(0, 16).flatMap(row => row.cells.flatMap(cell => cell.split(/\s+/))).filter(word => alnum(word));
    const spell = (from: number, rest: string, depth: number): string[] | null => {
      if (!rest) return [];
      if (depth > 4) return null;
      for (let i = from; i < Math.min(words.length, from + 12); i++) {
        const piece = alnum(words[i]);
        if (piece && rest.startsWith(piece)) { const tail = spell(i + 1, rest.slice(piece.length), depth + 1); if (tail) return [words[i], ...tail]; }
      }
      return null;
    };
    for (let start = 0; start < words.length; start++) {
      if (!stem.startsWith(alnum(words[start])) || alnum(words[start]).length < 3) continue;
      const tail = spell(start + 1, stem.slice(alnum(words[start]).length), 1);
      if (!tail) continue;
      const brand = [words[start], ...tail].map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ");
      const trade = rows.slice(0, 16).flatMap(row => row.cells).find(cell => COMPANY_SUFFIX.test(cell) && !contains(cell) && cell.length <= 40 && !/\d/.test(cell) && TRADE_WORD.test(cell));
      return trade ? `${brand} ${cleanName(trade)}` : brand;
    }
  }
  // A registered company name anywhere on the page that is not the customer.
  const registered: string[] = [];
  for (const row of rows) for (const cell of row.cells) {
    if (!COMPANY_SUFFIX.test(cell) || cell.length > 90) continue;
    const name = cleanName(cell);
    if (!usableName(name) || excluded(name)) continue;
    // Reject if the candidate is just the suffix alone (e.g. "Ltd") without a company stem
    const stem = name.replace(COMPANY_SUFFIX, "").replace(/[^A-Za-z0-9]/g, "");
    if (stem.length < 2) continue;
    // Reject if the entity name is an actual bank
    if (BANK.test(name) || /^(?:nat\s*west|barclays|hsbc|lloyds|santander|rbs|halifax|metro\s+bank)/i.test(name)) continue;
    registered.push(name);
  }
  if (registered.length) {
    // Logo letters read ahead of the letterhead ("R K RIVERSIDE ... LIMITED"):
    // the same name printed cleanly elsewhere on the page shows what to drop.
    const first = registered[0];
    const clean = registered.find((name) => alnum(name).length >= 6 && alnum(name).length < alnum(first).length && alnum(first).endsWith(alnum(name)));
    if (!clean) return first;
    const stripped = first.replace(/^(?:[A-Za-z]{1,2}\s+)+/, "");
    return alnum(stripped) === alnum(clean) ? stripped : clean;
  }
  // The payee printed with the bank details is the supplier's own trading name,
  // and is plain text even when the letterhead is a logo OCR cannot read.
  for (const row of rows) for (const cell of row.cells) {
    const match = cell.match(/^(?:account\s+name|a\/c\s+name|payee(?:\s+name)?|beneficiary(?:\s+name)?|cheques?\s+payable\s+to|make\s+payable\s+to)\s*[:\-–]?\s*(.{2,100})$/i);
    const name = match ? cleanName(match[1]) : "";
    if (name && usableName(name) && letters(name) >= 3 && !excluded(name)) return name;
  }
  // A short logo name with a parent-company line under it ("BOC" / "A Linde company").
  const top = rows.slice(0, 5).flatMap((row) => row.cells);
  for (let i = 1; i < top.length; i++) {
    if (!/^an?\s+[A-Za-z][\w&.-]*(?:\s+[A-Za-z][\w&.-]*)?\s+(?:company|group\s+company|business)$/i.test(top[i])) continue;
    const name = cleanName(top[i - 1]);
    if (name.length >= 2 && name.length <= 40 && letters(name) >= 2 && !NOT_A_NAME.test(name) && !excluded(name)) return name;
  }
  // Otherwise the letterhead: the first name-like text above the item table.
  const header = rows.slice(0, tableStart < 0 ? 12 : Math.min(tableStart, 14)).flatMap((row) => row.cells)
    .map(cleanName).filter((name) => usableName(name) && name.length >= 3 && name.length <= 60 && letters(name) >= 4 && letters(name) / name.length >= 0.6 && !NOT_A_NAME.test(name) && !BANK.test(name) && !excluded(name));
  return header.find((name) => TRADE_WORD.test(name)) ?? header[0] ?? "";
}

const UK_VAT = /(?<![A-Za-z0-9])(GB|XI)?\s?(\d{3})[\s.-]?(\d{3,4})[\s.-]?(\d{2,3})(?:[\s.-]?(\d{3}))?(?!\d)/gi;
const LABELLED_VAT = /(?:vat|tax)\s*(?:reg(?:istration)?\.?|no\.?|number|id\b)?\s*[:#\-–]?\s*(gb|xi)?\s*([0-9\s.-]{9,15})/gi;
const EU_VAT = /(?<![A-Za-z0-9])(IE|FR|DE|NL|ES|IT|BE|PL|PT|AT|DK|SE|FI|LU|CZ)\s?([0-9A-Z]{8,12})(?![A-Za-z0-9])/g;
const VAT_CONTEXT = /v\.?\s?a\.?\s?t|tax\s*(?:reg|id\b|no\b|number)/i;

// Small print on scans is often misread: "G8 795 6464 76", "GB 795 64б4 7б",
// "GB 79S 6464 76", "GB 795 O464 76". Only the value right after a VAT label
// is repaired, so other numbers on the row are untouched.
function repairVatOcr(text: string) {
  // "VAL No" / "VAI No": the T of VAT misread; only with No/Reg/Number after it.
  text = text.replace(/\bVA[LI1]\b(?=\.?\s*(?:reg|no\b|number))/gi, "VAT");
  return text.replace(/(v\.?\s?a\.?\s?t\.?\s*(?:reg(?:istration)?\.?\s*)?(?:no\.?|number|#)?\s*[:#\-–.]?\s*)([A-Za-z0-9бЗ|][A-Za-z0-9бЗ|\s.\-]{8,20})/gi, (_, label: string, value: string) => {
    let fixed = value.replace(/^\s*(?:G\s?8|6\s?B|C\s?B|C\s?8|G\s?E|6\s?8)(?=[\s.\-]?[0-9OoIlSB|бЗ])/i, "GB");
    const prefix = fixed.match(/^\s*(?:GB|XI)/i)?.[0] ?? "";
    let digits = fixed.slice(prefix.length)
      .replace(/[Oo]/g, "0").replace(/[Il|]/g, "1").replace(/б/g, "6").replace(/З/g, "3")
      .replace(/S(?=[\d\s])|(?<=[\d\s])S/g, "5").replace(/B(?=[\d\s])|(?<=[\d\s])B/g, "8");
    // Keep the repair only when it produced a VAT-shaped number.
    if (!/^[\s.\-]*\d{3}[\s.\-]?\d{3,4}[\s.\-]?\d{2,3}/.test(digits)) return label + value;
    fixed = prefix.toUpperCase() + digits;
    return label + fixed;
  });
}

export function validUkVat(digits: string) {
  if (digits.length < 9) return false;
  const sum = [8, 7, 6, 5, 4, 3, 2].reduce((total, weight, index) => total + weight * Number(digits[index]), 0) + Number(digits.slice(7, 9));
  return sum % 97 === 0 || (sum + 55) % 97 === 0;
}

// Digits OCR commonly confuses on small or thermal print.
const LOOKALIKE: Record<string, string> = { "0": "869", "1": "74", "2": "7", "3": "85", "4": "19", "5": "63", "6": "850", "7": "21", "8": "3609", "9": "804" };
// A VAT number failing the check digit test with exactly one single-digit
// lookalike correction that passes: that correction, else null.
export function repairUkVat(digits: string) {
  if (digits.length !== 9 || validUkVat(digits)) return null;
  const fixes = new Set<string>();
  for (let i = 0; i < 9; i++) for (const alt of LOOKALIKE[digits[i]] ?? "") {
    const candidate = digits.slice(0, i) + alt + digits.slice(i + 1);
    if (validUkVat(candidate)) fixes.add(candidate);
  }
  return fixes.size === 1 ? [...fixes][0] : null;
}
const vatCheck = (digits: string, notes: string[]) => {
  if (digits.length !== 9 || validUkVat(digits)) return digits;
  const fixed = repairUkVat(digits);
  if (fixed) { notes.push(`VAT number read as ${digits} failed the HMRC check digit test; one digit was corrected to ${fixed}. Check it against the original.`); return fixed; }
  notes.push(`VAT number ${digits} does not pass the HMRC check digit test. It may have been misread; check it against the original.`);
  return digits;
};

function readVatNumbers(rows: Row[], customerRow: number, context: ExtractionContext, notes: string[]) {
  const found: { value: string; row: number; customer: boolean }[] = [];
  const add = (value: string, row: number, text: string) => {
    if (found.some((item) => alnum(item.value).replace(/^gb/, "") === alnum(value).replace(/^gb/, ""))) return;
    const own = Boolean(context.companyVatNumber) && alnum(context.companyVatNumber!).replace(/^gb/, "") === alnum(value).replace(/^gb/, "");
    const isSupplierHeader = (row < 12 || /info@|www\.|co\.?\s*reg|awrs|tel:|phone|fax/i.test(text)) && !/customer\s*vat|client\s*vat|buyer\s*vat|your\s*vat/i.test(text);
    const isCustomer = own || (!isSupplierHeader && (/customer|client|your\s+vat|buyer/i.test(text) || (customerRow >= 0 && row > customerRow && row <= customerRow + 6 && !/our\s+vat|supplier/i.test(text))));
    found.push({ value, row, customer: isCustomer });
  };
  for (let r = 0; r < rows.length; r++) {
    const text = repairVatOcr(rows[r].text);
    const labelled = VAT_CONTEXT.test(text) || (text.length <= 40 && r > 0 && VAT_CONTEXT.test(rows[r - 1].text) && /(?:no\.?|number|reg\w*\.?|#|:)\s*$/i.test(rows[r - 1].text));
    for (const match of text.matchAll(UK_VAT)) {
      if (!match[1] && !labelled) continue;
      // Only a 9-digit number is a UK VAT number ("141 399 18" is a misread).
      if ((match[2] + match[3] + match[4]).length !== 9) continue;
      const digits = vatCheck(match[2] + match[3] + match[4], notes);
      add(`${(match[1] ?? "").toUpperCase()}${digits}${match[5] ?? ""}`, r, text);
    }
    for (const match of text.matchAll(LABELLED_VAT)) {
      let rawDigits = match[2].replace(/[^0-9]/g, "");
      if (rawDigits.length === 9 || rawDigits.length === 12) {
        if (rawDigits.length === 9) rawDigits = vatCheck(rawDigits, notes);
        add(`${(match[1] ?? (labelled ? "GB" : "")).toUpperCase()}${rawDigits}`, r, text);
      }
    }
    if (labelled) for (const match of text.matchAll(EU_VAT)) if ((match[2].match(/\d/g) ?? []).length >= 6) add(match[1] + match[2], r, text);
  }
  // With one party marked as the customer, the other number is the supplier's.
  let supplier = found.find((item) => !item.customer) ?? null;
  let customer = found.find((item) => item.customer) ?? null;
  // If only one VAT number was found on the document and supplier is unset:
  if (!supplier && found.length === 1) {
    const only = found[0];
    const isExplicitCustomer = Boolean(context.companyVatNumber && alnum(context.companyVatNumber).replace(/^gb/, "") === alnum(only.value).replace(/^gb/, ""))
      || /customer\s*vat|client\s*vat|buyer\s*vat|your\s*vat/i.test(rows[only.row]?.text ?? "");
    if (!isExplicitCustomer) {
      supplier = only;
      customer = null;
    }
  }
  return { supplier: supplier?.value ?? "", customer: customer?.value ?? "" };
}

// ---------------------------------------------------------------- VAT analysis

// "VAT Analysis" rows: "<code> 20.00 % 475.46 95.09". A row counts only when
// its own arithmetic holds (goods x rate = VAT), so OCR noise cannot slip in.
export function readVatAnalysis(rows: Row[]) {
  const groups = new Map<number, { goods: number; tax: number }>();
  for (const row of rows) {
    for (const match of row.text.matchAll(/(?<![\d.])(\d{1,2}(?:\.\d{1,2})?)\s*%\s*[|¦:\s]*£?\s*((?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2})\s*[|¦:\s]*£?\s*((?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2})(?![\d.])/g)) {
      const rate = Number(match[1]), goods = parseDocumentMoney(match[2]), tax = parseDocumentMoney(match[3]);
      if (goods === null || tax === null || ![0, 5, 20].includes(rate) || !close(goods * rate / 100, tax, 0.02)) continue;
      if (!groups.has(rate)) groups.set(rate, { goods, tax });
    }
  }
  return [...groups].map(([rate, group]) => ({ rate, ...group }));
}

// With one group per rate and lines whose net totals match, find which lines
// make up each smaller group (exact pennies), the rest take the largest group.
function assignFromVatAnalysis(open: ExtractedInvoiceLine[], groups: { rate: number; goods: number }[]) {
  if (groups.length < 2 || open.length > 60) return;
  const pence = (value: number) => Math.round(value * 100);
  if (pence(open.reduce((sum, line) => sum + line.netAmount, 0)) !== pence(groups.reduce((sum, group) => sum + group.goods, 0))) return;
  const ordered = [...groups].sort((a, b) => a.goods - b.goods), largest = ordered.pop()!;
  const taken = new Set<number>(), plan = new Map<number, number>();
  for (const group of ordered) {
    // Subset sum over the remaining lines; refuse if more than one subset fits.
    const target = pence(group.goods), ways = new Map<number, number[] | null>([[0, []]]);
    open.forEach((line, index) => {
      if (taken.has(index)) return;
      for (const [sum, subset] of [...ways]) {
        const next = sum + pence(line.netAmount);
        if (next > target) continue;
        const candidate = subset === null ? null : [...subset, index];
        ways.set(next, ways.has(next) ? null : candidate);
      }
    });
    const found = ways.get(target);
    if (!found || !found.length) return;
    for (const index of found) { taken.add(index); plan.set(index, group.rate); }
  }
  open.forEach((line, index) => { line.vatRate = plan.get(index) ?? largest.rate; });
}

// ---------------------------------------------------------------- entry point

export function extractInvoiceFields(input: string, context: ExtractionContext = {}): ExtractedInvoiceFields {
  const fields = extractDocumentFields(input, context);
  // Till receipts: prices include VAT and items carry VAT codes. The receipt
  // reading is used when its items add up to a total the receipt prints, or
  // when the invoice reading found no items at all.
  const receipt = readReceipt(input);
  if (!receipt || !(receipt.consistent || !fields.lines.length)) return fields;
  const lines: ExtractedInvoiceLine[] = receipt.lines.map((line) => ({ description: line.description, quantity: line.quantity, unitPrice: line.unitPrice, netAmount: line.amount, vatRate: line.vatRate, inclusive: true, ...(line.discount ? { discount: line.discount } : {}) }));
  const net = receipt.vat === null ? null : round2(receipt.gross - receipt.vat);
  return {
    ...fields,
    supplierName: receipt.retailer || nameFromWebsite(fields.supplierName, input).replace(/\((uk)\)/i, "(UK)"),
    invoiceNumber: fields.invoiceNumber || receipt.reference,
    currency: fields.currency ?? "GBP",
    read: { net, vat: receipt.vat, gross: receipt.gross },
    net, vat: receipt.vat, gross: receipt.gross, lines,
    vatNeedsReview: lines.some((line) => line.vatRate === null),
    notes: [...new Set([...fields.notes.filter((note) => /^VAT number/.test(note)), ...receipt.notes])],
    receipt: true
  };
}

function extractDocumentFields(input: string, context: ExtractionContext): ExtractedInvoiceFields {
  // Photos: a second, sparse OCR reading follows a form feed. It reads boxed
  // and white-on-dark totals well but loses table rows, so it only fills gaps.
  const split = input.indexOf("\f");
  const text = split < 0 ? input : input.slice(0, split);
  const extra = split < 0 ? null : extractDocumentFields(input.slice(split + 1).replace(/\f/g, ""), context);
  const rows = toRows(text);
  const notes: string[] = [];
  const { hits, totalRows } = readTotals(rows);
  const lines = readLines(rows, totalRows, notes);
  const linesNet = lines.length ? round2(lines.reduce((sum, line) => sum + line.netAmount, 0)) : null;
  const read = resolveTotals(hits, linesNet, notes);
  // VAT analysis box ("20.00 % 369.47 73.89"): each row passes its own
  // goods x rate = VAT check, so it is more reliable than a total OCR misread
  // ("360.47") or missed. Used when the read totals do not add up, and only
  // when it agrees with the read invoice total (or no total was read).
  const analysis = readVatAnalysis(rows);
  if (analysis.length) {
    const aNet = round2(analysis.reduce((sum, group) => sum + group.goods, 0)), aVat = round2(analysis.reduce((sum, group) => sum + group.tax, 0)), aGross = round2(aNet + aVat);
    const consistent = read.net !== null && read.vat !== null && read.gross !== null && close(read.net + read.vat, read.gross);
    const grossAgrees = read.gross !== null && (close(read.gross, aGross) || close(read.gross / 100, aGross));
    if (!consistent && (grossAgrees || (read.gross === null && (read.vat === null || close(read.vat, aVat))))) {
      // Warn only when a value that was read gets replaced (a misread), not when a missing one is filled.
      const replaced = (read.net !== null && !close(read.net, aNet)) || (read.vat !== null && !close(read.vat, aVat)) || (grossAgrees && !close(read.gross!, aGross));
      read.net = aNet; read.vat = aVat;
      if (grossAgrees) read.gross = aGross;
      if (replaced) notes.push("Totals were checked against the VAT analysis box. Check them against the original.");
    }
  }
  // Totals the main reading missed, from the sparse reading. Never replaces a
  // consistent set; a net is taken only when it agrees with the item lines.
  if (extra && !(read.net !== null && read.vat !== null && read.gross !== null && close(read.net + read.vat, read.gross))) {
    const more = extra.read;
    if (read.gross === null && more.gross !== null) read.gross = more.gross;
    if (read.net === null && more.net !== null && (linesNet === null || close(more.net, linesNet, 0.02))) read.net = more.net;
    if (read.vat === null && more.vat !== null && read.gross !== null && read.net !== null && close(read.net + more.vat, read.gross)) read.vat = more.vat;
  }

  const tableStart = rows.findIndex((row) => headerOrder(row) !== null);
  const customer = readCustomer(rows);
  const vatNumbers = readVatNumbers(rows, customer.row, context, notes);
  // No total found, and the document never mentions VAT at all (no VAT number,
  // no VAT column): a UK supplier that is not VAT registered cannot charge VAT,
  // so the total is the items and the VAT is zero.
  if (read.gross === null && read.vat === null && linesNet !== null && !vatNumbers.supplier && !extra?.supplierVatNumber && !/\bv\.?\s?a\.?\s?t\b/i.test(input) && lines.every((line) => !line.vatRate)) {
    read.vat = 0; read.gross = read.net ?? linesNet;
  }

  const net = read.net ?? (read.gross !== null && read.vat !== null ? round2(read.gross - read.vat) : linesNet);
  let vat = read.vat ?? (net !== null && read.gross !== null && read.gross - net > -0.005 ? round2(read.gross - net) : null);
  const gross = read.gross ?? (net !== null && read.vat !== null ? round2(net + read.vat) : null);

  // Line VAT rates: explicit on the line, else evidenced by the invoice totals.
  const noVatCharged = read.vat === 0 || (read.vat === null && read.gross !== null && net !== null && close(read.gross, net));
  const open = lines.filter((line) => line.vatRate === null);
  if (open.length) {
    if (noVatCharged) for (const line of open) line.vatRate = 0;
    else if (vat !== null && vat > 0) {
      const totalVat = vat;
      const explicitVat = lines.filter((line) => line.vatRate !== null).reduce((sum, line) => sum + line.netAmount * line.vatRate! / 100, 0);
      const openNet = open.reduce((sum, line) => sum + line.netAmount, 0);
      const mentioned = [...text.matchAll(/(?:vat|tax)[^\n%\d]{0,12}(\d{1,2}(?:\.\d{1,2})?)\s*%/gi)].map((match) => Number(match[1]));
      const rate = [...new Set([20, 5, ...mentioned])].find((candidate) => candidate > 0 && close(openNet * candidate / 100, totalVat - explicitVat, Math.max(0.05, 0.01 * open.length)));
      if (rate !== undefined) for (const line of open) line.vatRate = rate;
      else assignFromVatAnalysis(open, readVatAnalysis(rows));
    }
  }
  if (linesNet !== null && net !== null && !close(linesNet, net, 0.02)) notes.push("The line items do not add up to the invoice net total. A line may be missing or misread.");
  // Every line has its own rate, but the VAT they make differs from the invoice total: lines are missing (often a second page).
  else if (lines.length && lines.every((line) => line.vatRate !== null) && vat !== null) {
    const linesVat = lines.reduce((sum, line) => sum + line.netAmount * line.vatRate! / 100, 0);
    // VAT that was only derived (total minus items) is not evidence: show the VAT the read items carry.
    if (!close(linesVat, vat, Math.max(0.05, 0.01 * lines.length)) && read.vat === null) vat = round2(linesVat);
    if (!close(linesVat, read.vat ?? linesVat, Math.max(0.05, 0.01 * lines.length)) || (read.vat === null && read.gross !== null && net !== null && !close(net + linesVat, read.gross, Math.max(0.05, 0.01 * lines.length)))) notes.push("The invoice total does not match the items read. The invoice may have more pages (use “Add next page” below), or an item may be missing or misread. Check the totals against the original.");
  }

  const supplierName = readSupplier(rows, customer.name, context, tableStart) || extra?.supplierName || "";

  const invoiceNumber = firstLabelled(rows, [
    "(?:tax\\s+)?invoice\\s*(?:number|num\\.?|no\\.?|n[°º]\\.?|#|id|ref(?:erence)?\\.?)",
    "inv\\.?\\s*(?:number|no\\.?|#)",
    "(?:document|doc|bill|receipt|credit\\s+note|(?:cash\\s+)?sale|transaction|trans|trns|txn)\\s*(?:number|no\\.?|#)"
  ], acceptReference(false)) ?? firstLabelled(rows, [
    // Not "Invoice Total 1201.08", "Invoice Date", "Invoice To".
    "(?:tax\\s+)?invoices?(?!\\s*(?:total|date|to\\b|value|amount|address))",
    "(?<!(?:payment|supplier|customer|order|your|our|po|bank)\\s)(?:reference|ref\\.?)(?:\\s*(?:number|no\\.?))?"
  ], acceptReference(true)) ?? extra?.invoiceNumber ?? "";

  const invoiceDate = firstLabelled(rows, [
    "invoice\\s+date|date\\s+of\\s+invoice|inv\\.?\\s+date|tax\\s+point(?:\\s+date)?|date\\s+of\\s+issue|issue\\s+date|issued(?:\\s+on)?|document\\s+date|dated",
    "(?<!(?:due|delivery|order|payment|shipping|ship|despatch|dispatch|supply|printed|print|expiry|valid)\\s)date"
  ], acceptDate) ?? extra?.invoiceDate ?? (() => {
    for (const row of rows) {
      if (/\b(?:due|deliver\w*|order\w*|expir\w*|valid|printed)\b/i.test(row.text)) continue;
      for (const match of row.text.matchAll(new RegExp(`(?<![\\d/.-])(?:${DATE})(?![\\d/-])`, "gi"))) { const date = parseFlexibleDate(match[0]); if (date) return date; }
    }
    return null;
  })();
  const dueDate = firstLabelled(rows, ["due\\s+date|date\\s+due|payment\\s+due(?:\\s+(?:date|by|on))?|pay(?:ment)?\\s+by|due\\s+(?:by|on)", "due"], acceptDate) ?? extra?.dueDate ?? null;

  const explicitCurrency = text.match(/\bcurrency\s*[:\-]?\s*(GBP|EUR|USD)\b/i)?.[1].toUpperCase() as "GBP" | "EUR" | "USD" | undefined;
  const counts: ["GBP" | "EUR" | "USD", number][] = [["GBP", (text.match(/£|\bGBP\b/g) ?? []).length], ["EUR", (text.match(/€|\bEUR\b/g) ?? []).length], ["USD", (text.match(/\$|\bUSD\b/g) ?? []).length]];
  counts.sort((a, b) => b[1] - a[1]);
  const currency = explicitCurrency ?? (counts[0][1] > 0 && counts[0][1] > counts[1][1] ? counts[0][0] : null);

  return {
    supplierName, supplierVatNumber: vatNumbers.supplier || extra?.supplierVatNumber || "", customerName: customer.name || extra?.customerName || "", customerVatNumber: vatNumbers.customer,
    invoiceNumber, invoiceDate, dueDate, currency,
    read, net, vat, gross, lines,
    vatNeedsReview: lines.length ? lines.some((line) => line.vatRate === null) : read.vat === null,
    notes: [...new Set(notes)]
  };
}
