// Supplier price comparison built only from the company's own saved purchase
// invoice lines: product list, cheapest supplier, and price-change alerts.
// No external price data; every figure traces back to an invoice line.

export type PriceObservation = {
  lineId: string; invoiceId: string; invoiceNumber: string; issuedOn: string; // YYYY-MM-DD
  supplierId: string; supplierName: string; supplierEmail: string | null; supplierPhone: string | null;
  description: string; quantity: number; unitPrice: number; currency: string;
};
export type SupplierPrice = {
  supplierId: string; supplierName: string; latestPrice: number; latestOn: string; previousPrice: number | null;
  changePercent: number | null; lowestPrice: number; observations: number; lastQuantity: number; cheapest: boolean;
};
export type ProductComparison = {
  key: string; name: string; aliases: string[]; currency: string; suppliers: SupplierPrice[];
  bestSupplierId: string; bestPrice: number; highestPrice: number; savingPercent: number;
  lastPaidSupplierId: string; lastPaidPrice: number; lastQuantity: number; potentialSaving: number;
};
export type PriceAlert = { key: string; name: string; supplierId: string; supplierName: string; previousPrice: number; currentPrice: number; changePercent: number; on: string; currency: string };
export type PriceComparison = {
  window: { from: string; to: string; weeks: number; thresholdPercent: number };
  products: ProductComparison[]; alerts: PriceAlert[];
  suppliers: { id: string; name: string; email: string | null; phone: string | null; cheapestCount: number; products: number }[];
  totals: { products: number; suppliers: number; alerts: number; potentialSaving: number; currency: string };
};

const round = (value: number, places = 2) => Math.round((value + Number.EPSILON) * 10 ** places) / 10 ** places;

// Same product across invoices and suppliers: upper-case words without
// supplier stock codes, punctuation, plurals, descriptive words such as
// "loose" or "fresh", or word order. "Loose tomatoes" and "TOMATOES" share a key.
const FILLER = ["LOOSE", "FRESH"];
function singular(word: string) {
  if (word.length < 4 || /\d/.test(word)) return word;
  if (/OES?$/.test(word)) return word.replace(/OES?$/, "O");          // TOMATOES, TOMATOE -> TOMATO
  if (/IES$/.test(word)) return word.slice(0, -3) + "Y";              // CHERRIES -> CHERRY
  if (/(SS|X|CH|SH)ES$/.test(word)) return word.slice(0, -2);         // GLASSES -> GLASS
  if (/[^SU]S$/.test(word)) return word.slice(0, -1);                 // ONIONS -> ONION
  return word;
}
// Edit distance (insert, delete, change, or swap two neighbouring letters).
function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}
// Supplier spelling mistakes: OKARA ~ OKRA, LOSEE ~ LOOSE. Sizes and short words must
// match exactly, and short words must also keep their last letter (BREAD is not BREAM).
export function similarWord(a: string, b: string) {
  if (a === b) return true;
  const shortest = Math.min(a.length, b.length);
  if (shortest < 4 || /\d/.test(a + b) || a[0] !== b[0]) return false;
  if (shortest <= 5) return a.at(-1) === b.at(-1) && distance(a, b) <= 1;
  return distance(a, b) <= (shortest >= 7 ? 2 : 1);
}
const isFiller = (word: string) => FILLER.some(filler => word === filler || word.length >= 5 && word[0] === filler[0] && distance(word, filler) <= 2);
function productWords(description: string) {
  const words = description.toUpperCase()
    .replace(/^\s*[A-Z]{0,6}\d{3,}[A-Z0-9]*\s+/, "")      // leading stock code "51010 " / "CARTON1 "
    .replace(/[^A-Z0-9%./ ]+/g, " ")
    .replace(/\b(\d+)\s*(KG|G|L|LTR|LITRE|ML|CL|GAL)\b/g, "$1$2")
    .replace(/\bCLASS\s+(1|I|ONE)\b/g, " ")
    .split(/\s+/).filter(Boolean).map(singular);
  const kept = words.filter(word => !isFiller(word));
  return (kept.length ? kept : words).sort();
}
export function productKey(description: string) { return productWords(description).join(" "); }
// A size written without its unit on one invoice ("Red onions 10") is the same size written with
// it on another ("Red onion 10kg"): the bare number pairs with that number plus a weight or volume.
const SIZE = /^(\d+(?:\.\d+)?)(KG|G|L|LTR|LITRE|ML|CL|GAL)$/;
function sameSize(a: string, b: string) {
  const sized = SIZE.exec(a) ?? SIZE.exec(b), bare = SIZE.test(a) ? b : a;
  return Boolean(sized) && /^\d+(?:\.\d+)?$/.test(bare) && Number(bare) === Number(sized![1]);
}
// Same product despite small spelling differences: every word pairs with a similar word.
export function sameProduct(a: string, b: string) {
  const left = a.split(" ").filter(Boolean), right = b.split(" ").filter(Boolean);
  if (left.length !== right.length) return false;
  const used = new Set<number>();
  return left.every(word => { const at = right.findIndex((other, i) => !used.has(i) && (similarWord(word, other) || sameSize(word, other))); if (at < 0) return false; used.add(at); return true; });
}
// Name shown for a product: the newest spelling, but one that states its size ("10kg") is preferred
// over one that does not, so the pack size column is filled in.
const statesSize = (text: string) => /\b\d+(?:\.\d+)?\s*(?:kg|g|l|ltr|litre|ml|cl|gal)\b|\b\d+\s*x\s*\d+/i.test(text);
// Search that tolerates the same mistakes: every searched word is like a word of the name.
export function matchesProductSearch(names: readonly string[], query: string) {
  const wanted = productWords(query);
  if (!wanted.length) return true;
  return names.some(name => {
    const text = name.toUpperCase(), words = productWords(name);
    return text.includes(query.trim().toUpperCase()) || wanted.every(word => words.some(other => similarWord(word, other) || other.startsWith(word)));
  });
}

// Supplier name for matching duplicate records: case, punctuation and LTD/LIMITED do not matter.
export function supplierKey(name: string) {
  return name.toUpperCase().replace(/&/g, " AND ").replace(/[^A-Z0-9 ]+/g, " ").replace(/\b(LIMITED|LTD|PLC|LLP)\b/g, " ").replace(/\s+/g, " ").trim();
}

export function comparePrices(rows: readonly PriceObservation[], options: { asOf: string; weeks?: number; thresholdPercent?: number }): PriceComparison {
  const weeks = options.weeks ?? 12, threshold = options.thresholdPercent ?? 10;
  const to = options.asOf, from = new Date(Date.parse(`${to}T00:00:00Z`) - weeks * 7 * 86400000).toISOString().slice(0, 10);
  const recent = rows.filter(row => row.issuedOn >= from && row.issuedOn <= to && row.unitPrice > 0 && row.quantity > 0 && productKey(row.description));
  // One supplier saved more than once (the same name on several supplier records) is still one
  // supplier: its invoices are compared as one price history, not against each other.
  const canonical = new Map<string, string>();
  for (const row of [...recent].sort((a, b) => a.issuedOn.localeCompare(b.issuedOn) || a.supplierId.localeCompare(b.supplierId))) {
    const name = supplierKey(row.supplierName);
    if (name && !canonical.has(name)) canonical.set(name, row.supplierId);
  }
  for (const [index, row] of recent.entries()) {
    const id = canonical.get(supplierKey(row.supplierName));
    if (id && id !== row.supplierId) recent[index] = { ...row, supplierId: id };
  }
  const byProduct = new Map<string, PriceObservation[]>();
  for (const row of recent) {
    const words = productKey(row.description);
    let key = `${row.currency}|${words}`;
    if (!byProduct.has(key)) key = [...byProduct.keys()].find(existing => existing.startsWith(`${row.currency}|`) && sameProduct(existing.slice(row.currency.length + 1), words)) ?? key;
    const list = byProduct.get(key) ?? []; list.push(row); byProduct.set(key, list);
  }
  const newestFirst = (a: PriceObservation, b: PriceObservation) => b.issuedOn.localeCompare(a.issuedOn) || b.invoiceNumber.localeCompare(a.invoiceNumber) || b.lineId.localeCompare(a.lineId);
  const products: ProductComparison[] = [], alerts: PriceAlert[] = [];
  for (const [key, list] of byProduct) {
    const suppliers = new Map<string, PriceObservation[]>();
    for (const row of list) { const s = suppliers.get(row.supplierId) ?? []; s.push(row); suppliers.set(row.supplierId, s); }
    // Display name without the supplier's stock code ("51010 COBRA BEER KEG").
    const clean = (text: string) => text.trim().replace(/^\s*[A-Za-z]{0,6}\d{3,}[A-Za-z0-9]*\s+(?=\S)/, "");
    const newest = [...list].sort(newestFirst);
    const name = clean((newest.find(row => statesSize(clean(row.description))) ?? newest[0]).description);
    // Other spellings grouped under this product, so people can see what was combined.
    const aliases = [...new Map(list.map(row => [clean(row.description).toUpperCase(), clean(row.description)])).values()].filter(alias => alias.toUpperCase() !== name.toUpperCase());
    const prices: SupplierPrice[] = [...suppliers.values()].map(observations => {
      observations.sort(newestFirst);
      const latest = observations[0];
      // Previous price = the last different-dated purchase from this supplier.
      const previous = observations.find(row => row.issuedOn < latest.issuedOn) ?? null;
      const changePercent = previous ? round((latest.unitPrice - previous.unitPrice) / previous.unitPrice * 100, 1) : null;
      if (previous && changePercent !== null && Math.abs(changePercent) >= threshold) {
        alerts.push({ key, name, supplierId: latest.supplierId, supplierName: latest.supplierName, previousPrice: previous.unitPrice, currentPrice: latest.unitPrice, changePercent, on: latest.issuedOn, currency: latest.currency });
      }
      return { supplierId: latest.supplierId, supplierName: latest.supplierName, latestPrice: latest.unitPrice, latestOn: latest.issuedOn, previousPrice: previous?.unitPrice ?? null,
        changePercent, lowestPrice: Math.min(...observations.map(row => row.unitPrice)), observations: observations.length, lastQuantity: latest.quantity, cheapest: false };
    });
    const bestPrice = Math.min(...prices.map(p => p.latestPrice)), highestPrice = Math.max(...prices.map(p => p.latestPrice));
    const best = prices.filter(p => p.latestPrice === bestPrice).sort((a, b) => b.latestOn.localeCompare(a.latestOn))[0];
    best.cheapest = true;
    prices.sort((a, b) => a.latestPrice - b.latestPrice || a.supplierName.localeCompare(b.supplierName));
    const lastPaid = [...list].sort(newestFirst)[0];
    products.push({
      key, name, aliases, currency: lastPaid.currency, suppliers: prices, bestSupplierId: best.supplierId, bestPrice, highestPrice,
      savingPercent: highestPrice > 0 ? round((highestPrice - bestPrice) / highestPrice * 100, 1) : 0,
      lastPaidSupplierId: lastPaid.supplierId, lastPaidPrice: lastPaid.unitPrice, lastQuantity: lastPaid.quantity,
      potentialSaving: round(Math.max(0, lastPaid.unitPrice - bestPrice) * lastPaid.quantity)
    });
  }
  products.sort((a, b) => b.suppliers.length - a.suppliers.length || b.potentialSaving - a.potentialSaving || a.name.localeCompare(b.name));
  alerts.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent) || b.on.localeCompare(a.on));
  const supplierInfo = new Map<string, PriceComparison["suppliers"][number]>();
  for (const row of recent) if (!supplierInfo.has(row.supplierId)) supplierInfo.set(row.supplierId, { id: row.supplierId, name: row.supplierName, email: row.supplierEmail, phone: row.supplierPhone, cheapestCount: 0, products: 0 });
  for (const product of products) for (const price of product.suppliers) {
    const info = supplierInfo.get(price.supplierId)!; info.products++; if (price.cheapest) info.cheapestCount++;
  }
  const suppliers = [...supplierInfo.values()].sort((a, b) => b.cheapestCount - a.cheapestCount || b.products - a.products || a.name.localeCompare(b.name));
  const currency = products[0]?.currency ?? "GBP";
  return {
    window: { from, to, weeks, thresholdPercent: threshold }, products, alerts, suppliers,
    totals: { products: products.length, suppliers: suppliers.length, alerts: alerts.length, potentialSaving: round(products.filter(p => p.currency === currency).reduce((sum, p) => sum + p.potentialSaving, 0)), currency }
  };
}
