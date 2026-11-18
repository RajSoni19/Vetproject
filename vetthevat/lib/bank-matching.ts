// Bank statement -> purchase invoice matching. Pure functions: parsing the
// statement (a bank export, or the accountant's Supplier / Amount / Date list),
// and matching money paid out to saved purchase invoices so each payment carries
// its VAT. Only a verified match claims VAT; everything else goes at £0.

export type BankTransaction = { id: string; date: string; description: string; amount: number; direction: "out" | "in" };
export type PayableInvoice = { id: string; number: string; issuedOn: string; supplierName: string; net: number; vat: number; gross: number; currency: string; state?: string };
export type MatchStatus = "Matched" | "Possible match" | "No invoice";
// A person's decision on a payment: the invoice chosen, or null for "no invoice".
export type MatchDecisions = Record<string, string | null>;
// Statement name -> supplier, remembered once a person confirms them as the same.
export type NameMemory = Record<string, string>;
export type MatchedTransaction = BankTransaction & { status: MatchStatus; invoice: PayableInvoice | null; candidates: PayableInvoice[]; reason: string };

const pence = (value: number) => Math.round(value * 100);
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// Dates as banks export them: 05/10/2026, 05-10-26, 2026-10-05, 05 Oct 2026, Excel serials.
// dayFirst: 05/10/2026 is 5 October (UK). Set false for a file written month first.
export function statementDate(value: unknown, dayFirst = true): string | null {
  if (typeof value === "number" && value > 30000 && value < 80000) return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10);
  const text = String(value ?? "").trim();
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return valid(+match[1], +match[2], +match[3]);
  match = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (match) return valid(+match[3] + (match[3].length === 2 ? 2000 : 0), dayFirst ? +match[2] : +match[1], dayFirst ? +match[1] : +match[2]);
  match = text.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s-]+(\d{2,4})$/);
  if (match) return valid(+match[3] + (match[3].length === 2 ? 2000 : 0), MONTHS.indexOf(match[2].slice(0, 3).toLowerCase()) + 1, +match[1]);
  return null;
}
function valid(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.toISOString().slice(0, 10) : null;
}
function amountOf(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value ?? "").trim();
  if (!text) return null;
  const negative = /^\(.*\)$/.test(text) || /^-/.test(text) || /\bDR\b/i.test(text);
  const cleaned = text.replace(/[£$€,\s()]|\b(?:DR|CR|GBP)\b/gi, "").replace(/^-/, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) return null;
  return (negative ? -1 : 1) * Number(cleaned);
}

// A file is month-first only if some date cannot be day-first (11/25/2026) and none is the other way round.
function fileIsDayFirst(cells: unknown[]) {
  let dayOnly = false, monthOnly = false;
  for (const cell of cells) {
    const match = String(cell ?? "").trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}$/);
    if (!match) continue;
    if (+match[1] > 12) dayOnly = true;
    if (+match[2] > 12) monthOnly = true;
  }
  return dayOnly || !monthOnly;
}

// Rows from a CSV/Excel sheet (first row = headers). Understands the accountant's
// Supplier / Amount / Date list, a signed Amount column, or separate Paid out /
// Paid in (Debit / Credit) columns.
export function parseStatementRows(rows: unknown[][]): { transactions: BankTransaction[]; skipped: number; error?: string } {
  const headerIndex = rows.findIndex(row => row.some(cell => /date/i.test(String(cell ?? ""))) && row.some(cell => /amount|total|debit|credit|paid|money|value|out|in\b/i.test(String(cell ?? ""))));
  if (headerIndex < 0) return { transactions: [], skipped: rows.length, error: "No header row with a Date column and an Amount column was found." };
  const header = rows[headerIndex].map(cell => String(cell ?? "").trim().toLowerCase());
  const find = (pattern: RegExp, except: number[] = []) => header.findIndex((h, index) => pattern.test(h) && !except.includes(index));
  const date = find(/^(transaction\s+|payment\s+)?date|date$/);
  const out = find(/paid\s*out|money\s*out|debit|withdrawal|out$/), into = find(/paid\s*in|money\s*in|credit|deposit|in$/), amount = find(/amount|value|^total$/);
  const named = find(/supplier|payee|beneficiary|merchant/, [date]);
  const description = named >= 0 ? named : find(/description|details|narrative|reference|memo|name|transaction/, [date]);
  if (date < 0 || (out < 0 && amount < 0)) return { transactions: [], skipped: rows.length, error: "Could not find the Date and Amount columns." };
  const body = rows.slice(headerIndex + 1), dayFirst = fileIsDayFirst(body.map(row => row[date]));
  // One Amount column with no minus signs is a list of payments, not a signed bank export.
  const allPayments = out < 0 && !body.some(row => (amountOf(row[amount]) ?? 0) < 0);
  const transactions: BankTransaction[] = []; let skipped = 0;
  body.forEach((row, index) => {
    const day = statementDate(row[date], dayFirst);
    let value: number | null = null, direction: "out" | "in" = "out";
    if (out >= 0 && amountOf(row[out])) { value = Math.abs(amountOf(row[out])!); direction = "out"; }
    else if (into >= 0 && amountOf(row[into])) { value = Math.abs(amountOf(row[into])!); direction = "in"; }
    else if (amount >= 0 && amountOf(row[amount]) !== null) { const signed = amountOf(row[amount])!; value = Math.abs(signed); direction = allPayments || signed < 0 ? "out" : "in"; }
    if (!day || !value) { if (row.some(cell => String(cell ?? "").trim())) skipped++; return; }
    transactions.push({ id: `t${index + 1}`, date: day, description: description >= 0 ? String(row[description] ?? "").trim().slice(0, 300) : "", amount: Math.round(value * 100) / 100, direction });
  });
  return { transactions, skipped };
}

const words = (text: string) => text.toUpperCase().replace(/\b(?:LTD|LIMITED|PLC|LLP|THE|AND|CO|CASH|CARRY)\b|[^A-Z0-9 ]/g, " ").split(/\s+/).filter(w => w.length >= 3);
// Does the bank description name the supplier? ("TEMPLE WINES C&C" ~ "Temple Wines (Cash & Carry) Ltd")
export function namesSupplier(description: string, supplier: string) {
  const bank = new Set(words(description)), name = words(supplier);
  return name.length > 0 && name.some(w => bank.has(w) || [...bank].some(b => b.length >= 4 && (w.startsWith(b) || b.startsWith(w))));
}

export const nameKey = (text: string) => words(text).join(" ");

// Every payment is matched on amount. It is verified automatically only when the
// supplier also agrees, the date is close, and exactly one invoice fits. A different
// name, a distant date or several identical invoices stay "Possible match" for a
// person to check. Each invoice is used once.
export function matchTransactions(transactions: readonly BankTransaction[], invoices: readonly PayableInvoice[], names: NameMemory = {}): MatchedTransaction[] {
  const used = new Set<string>(), results = new Map<string, MatchedTransaction>();
  const gap = (t: BankTransaction, i: PayableInvoice) => (Date.parse(t.date) - Date.parse(i.issuedOn)) / 86400000;
  const inWindow = (t: BankTransaction, i: PayableInvoice) => gap(t, i) >= -7 && gap(t, i) <= 180;
  const isNamed = (t: BankTransaction, i: PayableInvoice) => Boolean(t.description) && (namesSupplier(t.description, i.supplierName) || names[nameKey(t.description)] === nameKey(i.supplierName));
  const closest = (t: BankTransaction, list: PayableInvoice[]) => [...list].sort((a, b) => Number(isNamed(t, b)) - Number(isNamed(t, a)) || Math.abs(gap(t, a)) - Math.abs(gap(t, b)));
  const sameAmount = (t: BankTransaction) => invoices.filter(i => pence(i.gross) === pence(t.amount));
  const place = (t: BankTransaction, invoice: PayableInvoice, status: MatchStatus, reason: string) => { used.add(invoice.id); results.set(t.id, { ...t, status, invoice, candidates: closest(t, sameAmount(t)), reason }); };
  const ordered = [...transactions].filter(t => t.direction === "out").sort((a, b) => a.date.localeCompare(b.date));
  // Certain matches first, so a weaker guess can never take their invoice.
  for (const t of ordered) {
    const fits = sameAmount(t).filter(i => !used.has(i.id) && isNamed(t, i) && inWindow(t, i));
    if (fits.length === 1) place(t, fits[0], "Matched", `Same amount and supplier (${fits[0].supplierName})`);
  }
  for (const t of ordered) {
    if (results.has(t.id)) continue;
    const free = sameAmount(t).filter(i => !used.has(i.id));
    if (!free.length) continue;
    const invoice = closest(t, free)[0], named = isNamed(t, invoice), twins = free.filter(i => isNamed(t, i) === named).length;
    place(t, invoice, "Possible match", twins > 1 ? `${twins} invoices have this amount; check which one` : !named ? "Same amount, but the supplier name is different" : "Same amount and supplier, but the date is far from the invoice");
  }
  return transactions.map(t => {
    const found = results.get(t.id);
    if (found) return found;
    const candidates = t.direction === "out" ? closest(t, sameAmount(t)) : [];
    return { ...t, status: "No invoice" as const, invoice: null, candidates, reason: t.direction === "in" ? "Money in (not a purchase)" : candidates.length ? "The invoice with this amount is already used by another payment" : "No saved purchase invoice with this amount" };
  });
}

// Applies what the person verified. Choosing an invoice releases it from any other payment.
export function applyDecisions(rows: readonly MatchedTransaction[], decisions: MatchDecisions, invoices: readonly PayableInvoice[]): MatchedTransaction[] {
  let result = [...rows];
  for (const [id, decision] of Object.entries(decisions)) {
    if (decision === null) { result = result.map(row => row.id === id ? { ...row, status: "No invoice", invoice: null, reason: "Marked by you as having no invoice" } : row); continue; }
    const invoice = invoices.find(item => item.id === decision);
    if (!invoice) continue;
    result = result.map(row => row.id === id ? { ...row, status: "Matched", invoice, reason: "Verified by you" }
      : row.invoice?.id === invoice.id ? { ...row, status: "No invoice", invoice: null, reason: "Its invoice was chosen for another payment" } : row);
  }
  return result;
}

export function matchSummary(rows: readonly MatchedTransaction[]) {
  const out = rows.filter(r => r.direction === "out");
  const sum = (list: readonly MatchedTransaction[], pick: (r: MatchedTransaction) => number) => Math.round(list.reduce((s, r) => s + pick(r), 0) * 100) / 100;
  const matched = out.filter(r => r.status === "Matched"), possible = out.filter(r => r.status === "Possible match"), missing = out.filter(r => r.status === "No invoice");
  return { paymentsOut: out.length, matched: matched.length, possible: possible.length, missing: missing.length,
    paidOut: sum(out, r => r.amount), vatEvidenced: sum(matched, r => r.invoice!.vat), vatToConfirm: sum(possible, r => r.invoice!.vat), unmatchedAmount: sum(missing, r => r.amount) };
}
