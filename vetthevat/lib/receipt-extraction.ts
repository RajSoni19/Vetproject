// Till receipts (Lidl, Tesco, Aldi, Costco, ...). Unlike invoices, receipt
// prices INCLUDE VAT, each item carries a VAT code letter (A, B, ...) that a
// "VAT RATE / SALES / VAT" table at the bottom explains, and the total is
// printed several times (TOTAL, CARD, "Amount £x"). Thermal-print OCR misreads
// many characters, so every value is cross-checked:
// - an item amount is quantity x price when both are printed ("5 x £1.99");
// - the total is the value most of TOTAL / CARD / Amount / VAT-table agree on;
// - each VAT-table row must pass its own rate check (VAT = sales x r / (100 + r));
// - item VAT codes are checked against the table sums, and when they do not add
//   up the items are assigned to codes by exact pennies (unique fit only).
// Nothing is invented: a value is read, or derived by arithmetic from read values.
import { parseDocumentMoney } from "@/lib/invoice-parsing";

// amount: the line total actually paid (after any discount), VAT included.
export type ReceiptLine = { description: string; quantity: number; unitPrice: number; discount: number; amount: number; vatRate: number | null };
// consistent: the items add up to a total the receipt itself prints.
export type ReceiptFields = { retailer: string; reference: string; lines: ReceiptLine[]; gross: number; vat: number | null; consistent: boolean; notes: string[] };

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const pence = (value: number) => Math.round(value * 100);
const RATES = [0, 5, 20];

// Retailers whose receipts often show the brand only as a logo or in small print.
const RETAILERS: [RegExp, string][] = [
  [/\bl[i1l]dl\b|\bl\W?dl\b|lidl\s*plus/i, "Lidl"], [/\baldi\b/i, "Aldi"], [/\btesco\b|clubcard/i, "Tesco"],
  [/\bsainsbury'?s?\b|nectar/i, "Sainsbury's"], [/\basda\b/i, "Asda"], [/\bmorrisons\b/i, "Morrisons"],
  [/\bwaitrose\b/i, "Waitrose"], [/\bco-?op\b|\bco-operative\b/i, "Co-op"], [/\biceland\b/i, "Iceland"],
  [/\bcostco\b/i, "Costco"], [/\bbooker\b/i, "Booker"], [/\bmakro\b/i, "Makro"], [/marks\s*(?:&|and)\s*spencer|\bm\s*&\s*s\b/i, "Marks & Spencer"],
  [/\bb\s*&\s*m\b/i, "B&M"], [/home\s*bargains/i, "Home Bargains"], [/\bpoundland\b/i, "Poundland"], [/\bscrewfix\b/i, "Screwfix"],
  [/\btoolstation\b/i, "Toolstation"], [/\bwickes\b/i, "Wickes"], [/\bb\s*&\s*q\b/i, "B&Q"], [/\bboots\b/i, "Boots"], [/\bargos\b/i, "Argos"]
];

type Row = { text: string; cells: string[] };
function toRows(text: string): Row[] {
  return text.replace(/\r/g, "").replace(/ /g, " ")
    // "22. 85" / "22 .85": a gap inside an amount.
    .replace(/(\d)\s*\.\s+(\d{2})(?!\d)/g, "$1.$2").replace(/(\d)\s+\.(\d{2})(?!\d)/g, "$1.$2")
    .split("\n").map((raw) => {
      const cells = raw.split(/\t+| {2,}|\|/).map((cell) => cell.replace(/\s+/g, " ").trim()).filter((cell) => cell && !/^[^A-Za-z0-9£]+$/.test(cell));
      // A photo's left edge (crumpled paper, table) reads as a short junk cell: "oN", "BE", "4".
      if (cells.length >= 2 && cells[0].length <= 3 && !/[£.%]/.test(cells[0])) cells.shift();
      return { cells, text: cells.join(" ") };
    }).filter((row) => row.cells.length);
}

const RECEIPT_WORDS = /receipt|customer\s+copy|contactless|change\s+due|cashier|till\b|\bcard\s+(?:sale|payment)|american\s+express|\bamex\b|\bvisa\b|mastercard|debit\s+account|auth\s+code|\bTID\b|\bMID\b/i;
// Rows that end the item list.
const STOP = /^(?:sub\s*-?\s*total|total|balance|to\s+pay|amount\s+due|card\b|cash\b|change\b|visa|mastercard|amex|american\s+express|debit|credit|contactless|\d+\s+items?\b|number\s+of\b|savings?\b|vat\s+rate|vat\s*%|vat\s+summary|\*?customer\s+copy|payment)/i;
const NOT_ITEM = /\bvat\s*(?:no|reg|number)\b|\btel\b|telephone|phone|www\.|\.co\.uk|^£$|\b(?:date|time)\s*:|\breceipt\b|\btill\b|welcome|served\s+by|cashier/i;
const AMOUNT = "(-?\\d{1,5}\\.\\d{2})(-)?";
const QTY = /(\d{1,3}(?:\.\d{1,3})?)\s*(?:kg\s*)?[x×X@*]\s*£?\s*(\d{1,5}\.\d{2})(?:\s*\/\s*kg)?/;

// VAT table rows: "A 0% 22.20 0.00", "B70 % 0.65 0.11" (20 misread), "B 20.00% 0.65 0.11".
function readVatTable(rows: Row[]) {
  const groups = new Map<string, { code: string; rate: number; sales: number; tax: number }>();
  for (const row of rows) {
    const match = row.text.match(/^([A-Z*])\s*[:\-]?\s*(\d{1,2}(?:\.\d{1,2})?)\s*%\s*£?\s*(\d{1,6}\.\d{2})\s*£?\s*(\d{1,6}\.\d{2})\b/);
    if (!match) continue;
    const code = match[1], printed = Number(match[2]), sales = Number(match[3]), tax = Number(match[4]);
    // Receipt sales are VAT-inclusive: tax = sales x r / (100 + r).
    const fits = (rate: number) => Math.abs(sales * rate / (100 + rate) - tax) <= 0.011;
    const rate = RATES.includes(printed) && fits(printed) ? printed : RATES.find(fits);
    if (rate === undefined || groups.has(code)) continue;
    groups.set(code, { code, rate, sales, tax });
  }
  // Without code letters, under a "VAT% / Total / VAT Value" heading: "20.00 55.48 9.25"
  // (a VAT amount read without its point, "925", is 9.25 when the rate check holds).
  const heading = rows.findIndex((row) => /vat\s*%|vat\s+summary|vat\s+rate/i.test(row.text));
  if (!groups.size && heading >= 0) for (const row of rows.slice(heading, heading + 5)) {
    const match = row.text.match(/^(\d{1,2}(?:\.\d{1,2})?)\s*%?\s+£?(\d{1,6}\.\d{2})\s+£?(\d{1,6}(?:\.\d{2})?)$/);
    if (!match) continue;
    const printed = Number(match[1]), sales = Number(match[2]), tax = match[3].includes(".") ? Number(match[3]) : Number(match[3]) / 100;
    if (RATES.includes(printed) && Math.abs(sales * printed / (100 + printed) - tax) <= 0.011 && !groups.has(`%${printed}`)) groups.set(`%${printed}`, { code: `%${printed}`, rate: printed, sales, tax: round2(tax) });
  }
  return [...groups.values()];
}

// Every printed total: TOTAL / BALANCE / CARD / "Amount £x"; a label on its own
// row takes the amount-only row right below (sparse readings split them).
function totalVotes(rows: Row[]) {
  const votes: number[] = [];
  const LABEL = /^(?:total|balance(?:\s+due)?|to\s+pay|amount(?:\s+due)?|[a-z]?mount|card|visa|mastercard|debit|amex)\b/i;
  const cashWithChange = rows.some((row) => /\bchange\b/i.test(row.text));
  for (let r = 0; r < rows.length; r++) {
    const text = rows[r].text;
    if (!LABEL.test(text) || /\bsub\s*-?\s*total|total\s+(?:savings|discount|items?)/i.test(text)) continue;
    if (/^cash\b/i.test(text) && cashWithChange) continue;
    const same = text.match(/£?\s*(\d{1,5}\.\d{2})\s*$/);
    if (same) { votes.push(Number(same[1])); continue; }
    for (let next = r + 1; next <= r + 2 && next < rows.length; next++) {
      const only = rows[next].text.match(/^£?\s*(\d{1,5}\.\d{2})$/);
      if (only) { votes.push(Number(only[1])); break; }
    }
  }
  return votes;
}

// "x £1.75" with the quantity lost (e.g. "Pack’ x £1.75" for "Pack7 x £1.75").
const PRICE_ONLY = /[x×]\s*£\s*(\d{1,5}\.\d{2})/;
// discount: money taken off the line (Clubcard / multibuy price); amount is after it.
type Item = { description: string; quantity: number | null; unitPrice: number | null; amount: number | null; discount: number; code: string | null; read: number | null; calc: number | null };

const cleanDescription = (value: string) => {
  const text = value.replace(/[’'`/\\|]+\s*$/, "").replace(/^[A-Z]{1,2}\s+(?=[A-Z][a-z])/, "").replace(/^[^A-Za-z0-9]+/, "").replace(/\s+/g, " ").trim();
  return text ? text[0].toUpperCase() + text.slice(1) : "";
};
// A row of words only (a wrapped description), not OCR noise.
const wordsOnly = (text: string) => /[A-Za-z]{3,}/.test(text) && !/£|\d\.\d{2}/.test(text);

// Where the item list starts: after the supplier's VAT number line, when there is one.
const itemStart = (rows: Row[]) => rows.findIndex((row) => /\bvat\s*(?:no|reg|number)\b/i.test(row.text)) + 1;

// Layout with the quantity first (Tesco and similar):
//   "2 Captain Morgan Mid Strength Spirit   £30.00"
//   "  Drink 70cl"                       (description continues)
//   "  £15.00 each"                      (unit price)
//   "  Cc £12.00                -£6.00"  (Clubcard / offer price and saving)
// The line total is quantity x the offer price (else the unit price), so a
// misaligned or misread amount column does not matter.
type QtyItem = { description: string; qty: number | null; each: number | null; offer: number | null; read: number | null; saving: number | null };
const QTY_FIRST = /^(?:\S{1,3}\s+)?(\d{1,2}|[SIl{|])\s+([A-Za-z][A-Za-z'’&.-]*(?:\s.*)?)$/;
const EACH = /^£?\s*(\d{1,5}\.\d{2})\s*eac?h?\S*/i;
const OFFER = /^c[ce]\s*£\s*(\d{1,5}\.\d{2})/i;
const MONEY_AT_END = /(-?)£\s*(\d{1,5}\.\d{2})\s*$/;

function readQtyFirstItems(rows: Row[]): Item[] {
  const found: QtyItem[] = [];
  for (let r = Math.max(0, itemStart(rows)); r < rows.length; r++) {
    const text = rows[r].text;
    if (STOP.test(text)) break;
    if (NOT_ITEM.test(text)) continue;
    const last = found[found.length - 1];
    const offer = text.match(OFFER);
    if (offer && last) { last.offer = Number(offer[1]); const saving = text.slice(offer[0].length).match(MONEY_AT_END); if (saving) last.saving = Number(saving[2]); continue; }
    const each = text.match(EACH);
    if (each && last) { last.each = Number(each[1]); continue; }
    const money = text.match(MONEY_AT_END);
    const head = money ? text.slice(0, money.index).trim() : text;
    if (money && money[1] === "-" && !head && last) { last.saving = Number(money[2]); continue; }
    const start = head.match(QTY_FIRST);
    if (start && (money || /^\d/.test(start[1]) || /^[SIl{|]$/.test(start[1]))) {
      const description = cleanDescription(start[2].replace(/£\s*\d.*$/, ""));
      if (description) { found.push({ description, qty: /^\d+$/.test(start[1]) ? Number(start[1]) : null, each: null, offer: null, read: money && money[1] !== "-" ? Number(money[2]) : null, saving: null }); continue; }
    }
    if (money && head && wordsOnly(head) && !start) { found.push({ description: cleanDescription(head), qty: null, each: null, offer: null, read: Number(money[2]), saving: null }); continue; }
    if (!money && last && wordsOnly(text)) last.description = `${last.description} ${cleanDescription(text)}`.slice(0, 300);
  }
  return found.map((item): Item => {
    let qty = item.qty;
    const integer = (value: number) => Math.abs(value - Math.round(value)) < 0.001 && Math.round(value) >= 1 ? Math.round(value) : null;
    if (qty === null && item.each) qty = (item.read !== null ? integer(item.read / item.each) : null) ?? (item.saving !== null && item.offer !== null && item.each > item.offer ? integer(item.saving / (item.each - item.offer)) : null);
    if (item.each !== null) {
      const quantity = qty ?? 1, full = round2(quantity * item.each), amount = round2(quantity * (item.offer ?? item.each));
      return { description: item.description, quantity, unitPrice: item.each, amount, discount: round2(full - amount), code: null, read: null, calc: amount };
    }
    const quantity = qty ?? 1;
    if (item.read === null) return { description: item.description, quantity, unitPrice: null, amount: null, discount: 0, code: null, read: null, calc: null };
    const amount = item.offer !== null ? round2(quantity * item.offer) : item.read;
    return { description: item.description, quantity, unitPrice: round2(item.read / quantity), amount, discount: round2(item.read - amount), code: null, read: null, calc: null };
  });
}

function readItems(rows: Row[]) {
  if (rows.some((row) => EACH.test(row.text) || OFFER.test(row.text))) return readQtyFirstItems(rows);
  const anchor = itemStart(rows);
  const items: Item[] = [];
  for (let r = Math.max(0, anchor); r < rows.length; r++) {
    const row = rows[r], text = row.text;
    if (STOP.test(text)) break;
    if (NOT_ITEM.test(text)) continue;
    const qty = text.match(QTY), priceOnly = qty ? null : text.match(PRICE_ONLY);
    let tail = text.match(new RegExp(`(?:£\\s*)?${AMOUNT}\\s*([A-Z*])?\\s*$`));
    let amountStart = tail ? text.length - tail[0].length : text.length;
    const lastCell = row.cells[row.cells.length - 1];
    // "0 65 PB": the decimal point read as a space, in the amount column.
    const spaced = !tail && row.cells.length > 1 ? lastCell.match(/^£?\s*(\d{1,4})[ ,](\d{2})\s*([A-Z]{1,2})?$/) : null;
    // "£100": the decimal point lost (receipts always print pence) — £1.00.
    const dotless = !tail && !spaced && row.cells.length > 1 ? lastCell.match(/^£\s*(\d{3,6})\s*([A-Z])?$/) : null;
    if (spaced) { tail = [lastCell, `${spaced[1]}.${spaced[2]}`, undefined, spaced[3]?.slice(-1)] as unknown as RegExpMatchArray; amountStart = text.length - lastCell.length; }
    else if (dotless) { tail = [lastCell, (Number(dotless[1]) / 100).toFixed(2), undefined, dotless[2]] as unknown as RegExpMatchArray; amountStart = text.length - lastCell.length; }
    // A row that is only "2 x £1.00": the quantity of the item above.
    if (qty && items.length && !/[A-Za-z]{3}/.test(text.slice(0, qty.index))) {
      const last = items[items.length - 1];
      if (last.calc === null) { last.quantity = Number(qty[1]); last.unitPrice = Number(qty[2]); last.calc = round2(last.quantity * last.unitPrice); }
      continue;
    }
    if (!tail && !qty && !priceOnly) {
      // Words only: the description continues ("COOKER ALU 12L"), or — after the
      // supplier header, before any priced item — an item whose price was lost.
      if (!wordsOnly(text)) continue;
      if (items.length) items[items.length - 1].description = `${items[items.length - 1].description} ${cleanDescription(text)}`.slice(0, 300);
      else if (anchor > 0) items.push({ description: cleanDescription(text), quantity: null, unitPrice: null, amount: null, discount: 0, code: null, read: null, calc: null });
      continue;
    }
    const read = tail ? Number(tail[1]) * (tail[2] ? -1 : 1) : null;
    // A negative amount (multibuy saving, Lidl Plus discount) reduces the item above.
    if (read !== null && read < 0) {
      const last = items[items.length - 1];
      if (last) { for (const key of ["amount", "read", "calc"] as const) if (last[key] !== null) last[key] = round2(last[key]! + read); last.discount = round2(last.discount - read); }
      continue;
    }
    const description = cleanDescription(text.slice(0, qty ? qty.index! : priceOnly ? priceOnly.index! : amountStart));
    if (!description || !/[A-Za-z]{2}/.test(description)) continue;
    const calc = qty ? round2(Number(qty[1]) * Number(qty[2])) : null;
    items.push({ description, quantity: qty ? Number(qty[1]) : priceOnly ? null : 1, unitPrice: qty ? Number(qty[2]) : priceOnly ? Number(priceOnly[1]) : read, amount: calc ?? read, discount: 0, code: tail?.[3] ?? null, read, calc });
  }
  return items;
}

// One item whose amount could not be read: the receipt total minus the other
// items. A lost quantity is recovered only when amount / price is a whole number.
function fillMissing(items: Item[], gross: number | null, notes: string[]) {
  const missing = items.filter((item) => item.amount === null);
  if (missing.length === 1 && gross !== null) {
    const rest = items.reduce((sum, item) => sum + (item.amount ?? 0), 0), amount = round2(gross - rest);
    if (amount > 0) {
      const item = missing[0];
      item.amount = amount;
      notes.push(`The amount of “${item.description}” was not readable; £${amount.toFixed(2)} was worked out from the receipt total. Check it against the receipt.`);
    }
  }
  for (const item of items) {
    if (item.amount === null) continue;
    if (item.quantity === null && item.unitPrice) {
      const quantity = item.amount / item.unitPrice;
      if (Math.abs(quantity - Math.round(quantity)) < 0.001 && Math.round(quantity) >= 1) { item.quantity = Math.round(quantity); item.calc = item.amount; continue; }
    }
    if (item.quantity === null || item.unitPrice === null) { item.quantity = 1; item.unitPrice = item.amount; }
  }
  return items.filter((item): item is Item & { amount: number; quantity: number; unitPrice: number } => item.amount !== null);
}

// Lines summing to the target: try quantity x price everywhere, then let one
// line use the amount read at the end of its row instead.
function settleAmounts(items: ReturnType<typeof fillMissing>, target: number | null) {
  const sum = () => pence(items.reduce((total, item) => total + item.amount, 0));
  if (target === null || sum() === pence(target)) return;
  for (const item of items) {
    if (item.read === null || item.calc === null || item.read === item.calc) continue;
    const before = item.amount; item.amount = item.read;
    if (sum() === pence(target)) { item.quantity = 1; item.unitPrice = item.read; return; }
    item.amount = before;
  }
}

// Exact-pennies assignment of items to VAT-table groups (unique fit only).
function assignCodes(items: ReceiptLine[], groups: { code: string; rate: number; sales: number }[], codes: (string | null)[]) {
  // The printed codes, if they add up to the table.
  const byCode = new Map(groups.map((group) => [group.code, group]));
  if (codes.every((code) => code !== null && byCode.has(code))) {
    const sums = new Map<string, number>();
    codes.forEach((code, index) => sums.set(code!, (sums.get(code!) ?? 0) + pence(items[index].amount)));
    if (groups.every((group) => (sums.get(group.code) ?? 0) === pence(group.sales))) {
      codes.forEach((code, index) => { items[index].vatRate = byCode.get(code!)!.rate; });
      return true;
    }
  }
  if (groups.length === 1) { items.forEach((item) => { item.vatRate = groups[0].rate; }); return true; }
  if (items.length > 40) return false;
  const ordered = [...groups].sort((a, b) => a.sales - b.sales), largest = ordered.pop()!;
  const taken = new Set<number>(), plan = new Map<number, number>();
  for (const group of ordered) {
    const target = pence(group.sales), ways = new Map<number, number[] | null>([[0, []]]);
    items.forEach((item, index) => {
      if (taken.has(index)) return;
      for (const [sum, subset] of [...ways]) {
        const next = sum + pence(item.amount);
        if (next > target) continue;
        ways.set(next, ways.has(next) ? null : subset === null ? null : [...subset, index]);
      }
    });
    const found = ways.get(target);
    if (!found || !found.length) return false;
    for (const index of found) { taken.add(index); plan.set(index, group.rate); }
  }
  items.forEach((item, index) => { item.vatRate = plan.get(index) ?? largest.rate; });
  return true;
}

export function looksLikeReceipt(text: string) {
  return RECEIPT_WORDS.test(text) && (/^[A-Z]\s*\d{1,2}(?:\.\d+)?\s*%/m.test(text) || /\d\.\d{2}\s+[A-Z]\s*$/m.test(text) || /\d\s*[x×]\s*£\d/.test(text)
    || /£\s?\d+\.\d{2}\s*eac/i.test(text) || /vat\s*%|vat\s+summary/i.test(text) || /\bsales\s+receipt\b|clubcard/i.test(text));
}

// A misread shop name checked against the receipt's own website: "POPAT STORIE (UK) LTD"
// with "www.popatstores.co.uk" becomes "POPAT STORES (UK) LTD". The leading words are
// corrected only when their letters match the web address letter for letter in count
// and differ in at most two places.
export function nameFromWebsite(name: string, text: string) {
  const stems = [...text.matchAll(/www\s*[.;,]?\s*([a-z0-9-]{4,})\s*\.\s*(?:co\s*\.?\s*uk|com|uk)\b/gi)].map((match) => match[1].toLowerCase().replace(/-/g, ""));
  const words = name.split(/\s+/);
  for (const stem of stems) {
    let letters = "";
    for (let count = 1; count <= Math.min(4, words.length); count++) {
      letters += words[count - 1].toLowerCase().replace(/[^a-z0-9]/g, "");
      if (letters.length !== stem.length) continue;
      const differences = [...letters].filter((char, index) => char !== stem[index]).length;
      if (differences === 0 || differences > 2) break;
      let at = 0;
      const fixed = words.slice(0, count).map((word) => {
        const clean = word.replace(/[^A-Za-z0-9]/g, "");
        const part = stem.slice(at, at + clean.length); at += clean.length;
        return clean === clean.toUpperCase() ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1);
      });
      return [...fixed, ...words.slice(count)].join(" ");
    }
  }
  return name;
}

// input: the main OCR reading, optionally followed by "\f" and a sparse reading.
export function readReceipt(input: string): ReceiptFields | null {
  if (!looksLikeReceipt(input)) return null;
  const split = input.indexOf("\f");
  const mainRows = toRows(split < 0 ? input : input.slice(0, split));
  const allRows = toRows(input.replace(/\f/g, "\n"));
  const notes: string[] = [];
  const table = readVatTable(mainRows).length ? readVatTable(mainRows) : readVatTable(allRows);
  const tableSales = table.length ? round2(table.reduce((sum, group) => sum + group.sales, 0)) : null;
  const tableVat = table.length ? round2(table.reduce((sum, group) => sum + group.tax, 0)) : null;

  // The total most printed values agree on; the VAT table sum counts as one vote.
  const votes = totalVotes(allRows);
  if (tableSales !== null) votes.push(tableSales);
  const tally = new Map<number, number>();
  for (const vote of votes) tally.set(pence(vote), (tally.get(pence(vote)) ?? 0) + 1);
  const tablePence = tableSales === null ? null : pence(tableSales);
  const ranked = [...tally].sort((a, b) => b[1] - a[1] || Number(b[0] === tablePence) - Number(a[0] === tablePence));
  let gross: number | null = ranked.length && (ranked[0][1] >= 2 || ranked.length === 1) ? ranked[0][0] / 100 : null;

  const items = fillMissing(readItems(mainRows), gross, notes);
  if (!items.length) return null;
  settleAmounts(items, gross);
  const itemsTotal = round2(items.reduce((sum, item) => sum + item.amount, 0));
  if (gross === null && tally.has(pence(itemsTotal))) gross = itemsTotal;
  const consistent = gross !== null && pence(itemsTotal) === pence(gross);
  if (gross === null) { gross = itemsTotal; notes.push("The receipt total could not be read clearly; it is the sum of the items. Check it against the receipt."); }
  else if (pence(itemsTotal) !== pence(gross)) notes.push(`The items read add up to £${itemsTotal.toFixed(2)} but the receipt total is £${gross.toFixed(2)}. An item may be missing or misread; check them against the receipt.`);

  const lines: ReceiptLine[] = items.map(({ description, quantity, unitPrice, amount, discount }) => ({ description, quantity, unitPrice, discount: discount > 0 && pence(quantity * unitPrice - discount) === pence(amount) ? discount : 0, amount, vatRate: null }));
  // A discount that does not reconcile is dropped: the line then carries the amount paid.
  lines.forEach((line) => { if (!line.discount && pence(line.quantity * line.unitPrice) !== pence(line.amount)) { line.quantity = 1; line.unitPrice = line.amount; } });
  let vat: number | null = null;
  if (table.length && tableSales !== null && pence(tableSales) === pence(gross)) {
    if (pence(itemsTotal) === pence(gross) && assignCodes(lines, table, items.map((item) => item.code))) vat = tableVat;
    else { vat = tableVat; notes.push("VAT codes of the items could not be matched to the receipt's VAT table. Choose the VAT for each item."); }
  } else if (table.length) notes.push("The receipt's VAT table did not match its total. Check the VAT against the receipt.");

  const retailer = RETAILERS.find(([pattern]) => pattern.test(input))?.[1] ?? "";
  // Receipt reference: "Sales Order: 26286868", "Receipt No 123", "Trans No. 4567".
  const reference = input.match(/\b(?:sales\s+order|order\s+no|receipt\s+(?:no|number)|trans(?:action)?\s*(?:no|number|#)|trns\s+no)\.?\s*[:#]?\s*([A-Z]{0,4}\d[A-Z0-9/-]{3,})/i)?.[1] ?? "";
  return { retailer, reference, lines, gross, vat, consistent, notes };
}
