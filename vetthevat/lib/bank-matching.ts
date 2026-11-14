// Bank statement -> purchase invoice matching. Pure functions: parsing of the
// statement rows, and matching of money paid out to saved purchase invoices so
// each payment shows the VAT it contains.

export type BankTransaction = { id: string; date: string; description: string; amount: number; direction: "out" | "in" };
export type PayableInvoice = { id: string; number: string; issuedOn: string; supplierName: string; net: number; vat: number; gross: number; currency: string };
export type MatchStatus = "Matched" | "Possible match" | "No invoice";
export type MatchedTransaction = BankTransaction & { status: MatchStatus; invoice: PayableInvoice | null; candidates: PayableInvoice[]; reason: string };

const pence = (value: number) => Math.round(value * 100);
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// Dates as banks export them: 05/10/2026, 05-10-26, 2026-10-05, 05 Oct 2026, Excel serials.
export function statementDate(value: unknown): string | null {
  if (typeof value === "number" && value > 30000 && value < 80000) return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10);
  const text = String(value ?? "").trim();
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return valid(+match[1], +match[2], +match[3]);
  match = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (match) return valid(+match[3] + (match[3].length === 2 ? 2000 : 0), +match[2], +match[1]);
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

// Rows from a CSV/Excel sheet (first row = headers). Understands a single
// signed Amount column, or separate Paid out / Paid in (Debit / Credit) columns.
export function parseStatementRows(rows: unknown[][]): { transactions: BankTransaction[]; skipped: number; error?: string } {
  const headerIndex = rows.findIndex(row => row.some(cell => /date/i.test(String(cell ?? ""))) && row.some(cell => /amount|debit|credit|paid|money|value|out|in\b/i.test(String(cell ?? ""))));
  if (headerIndex < 0) return { transactions: [], skipped: rows.length, error: "No header row with a Date column and an Amount (or Paid out / Paid in) column was found." };
  const header = rows[headerIndex].map(cell => String(cell ?? "").trim().toLowerCase());
  const find = (pattern: RegExp) => header.findIndex(h => pattern.test(h));
  const date = find(/^(transaction\s+)?date|date$/), description = find(/description|details|payee|narrative|reference|memo|name|transaction/);
  const out = find(/paid\s*out|money\s*out|debit|withdrawal|out$/), into = find(/paid\s*in|money\s*in|credit|deposit|in$/), amount = find(/^amount|value|amount/);
  if (date < 0 || (out < 0 && amount < 0)) return { transactions: [], skipped: rows.length, error: "Could not find the Date and Amount columns." };
  const transactions: BankTransaction[] = []; let skipped = 0;
  rows.slice(headerIndex + 1).forEach((row, index) => {
    const day = statementDate(row[date]);
    let value: number | null = null, direction: "out" | "in" = "out";
    if (out >= 0 && amountOf(row[out])) { value = Math.abs(amountOf(row[out])!); direction = "out"; }
    else if (into >= 0 && amountOf(row[into])) { value = Math.abs(amountOf(row[into])!); direction = "in"; }
    else if (amount >= 0 && amountOf(row[amount]) !== null) { const signed = amountOf(row[amount])!; value = Math.abs(signed); direction = signed < 0 ? "out" : "in"; }
    if (!day || !value) { if (row.some(cell => String(cell ?? "").trim())) skipped++; return; }
    transactions.push({ id: `t${index + 1}`, date: day, description: String(row[description] ?? "").trim().slice(0, 300), amount: Math.round(value * 100) / 100, direction });
  });
  return { transactions, skipped };
}

const words = (text: string) => text.toUpperCase().replace(/\b(?:LTD|LIMITED|PLC|LLP|THE|AND|CO|CASH|CARRY)\b|[^A-Z0-9 ]/g, " ").split(/\s+/).filter(w => w.length >= 3);
// Does the bank description name the supplier? ("TEMPLE WINES C&C" ~ "Temple Wines (Cash & Carry) Ltd")
export function namesSupplier(description: string, supplier: string) {
  const bank = new Set(words(description)), name = words(supplier);
  return name.length > 0 && name.some(w => bank.has(w) || [...bank].some(b => b.length >= 4 && (w.startsWith(b) || b.startsWith(w))));
}

// Money out is matched to an unpaid purchase invoice of the same gross amount,
// paid between 7 days before and 180 days after the invoice date. A supplier
// name in the bank description confirms it; otherwise one candidate is a
// "Possible match" for the person to confirm. Each invoice is used once.
export function matchTransactions(transactions: readonly BankTransaction[], invoices: readonly PayableInvoice[]): MatchedTransaction[] {
  const used = new Set<string>();
  const inWindow = (t: BankTransaction, i: PayableInvoice) => { const days = (Date.parse(t.date) - Date.parse(i.issuedOn)) / 86400000; return days >= -7 && days <= 180; };
  const results = new Map<string, MatchedTransaction>();
  // Strong matches first so a named payment is never taken by a weaker guess.
  const ordered = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  for (const pass of ["named", "single"] as const) {
    for (const t of ordered) {
      if (t.direction !== "out" || results.has(t.id)) continue;
      const candidates = invoices.filter(i => !used.has(i.id) && pence(i.gross) === pence(t.amount) && inWindow(t, i));
      const named = candidates.filter(i => namesSupplier(t.description, i.supplierName));
      const pick = (list: PayableInvoice[]) => [...list].sort((a, b) => Math.abs(Date.parse(t.date) - Date.parse(a.issuedOn)) - Math.abs(Date.parse(t.date) - Date.parse(b.issuedOn)))[0];
      if (pass === "named" && named.length) { const invoice = pick(named); used.add(invoice.id); results.set(t.id, { ...t, status: "Matched", invoice, candidates: named, reason: `Same amount and supplier (${invoice.supplierName})` }); }
      else if (pass === "single" && candidates.length) {
        const invoice = pick(candidates); used.add(invoice.id);
        results.set(t.id, { ...t, status: "Possible match", invoice, candidates, reason: candidates.length === 1 ? "Same amount; supplier name not in the bank description" : `${candidates.length} invoices with this amount; closest date chosen` });
      }
    }
  }
  return transactions.map(t => results.get(t.id) ?? { ...t, status: "No invoice" as const, invoice: null, candidates: [], reason: t.direction === "in" ? "Money in (not a purchase)" : "No saved purchase invoice with this amount" });
}

export function matchSummary(rows: readonly MatchedTransaction[]) {
  const out = rows.filter(r => r.direction === "out");
  const sum = (list: readonly MatchedTransaction[], pick: (r: MatchedTransaction) => number) => Math.round(list.reduce((s, r) => s + pick(r), 0) * 100) / 100;
  const matched = out.filter(r => r.status === "Matched"), possible = out.filter(r => r.status === "Possible match"), missing = out.filter(r => r.status === "No invoice");
  return { paymentsOut: out.length, matched: matched.length, possible: possible.length, missing: missing.length,
    paidOut: sum(out, r => r.amount), vatEvidenced: sum(matched, r => r.invoice!.vat), vatToConfirm: sum(possible, r => r.invoice!.vat), unmatchedAmount: sum(missing, r => r.amount) };
}
