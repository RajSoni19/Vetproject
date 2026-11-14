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
  key: string; name: string; currency: string; suppliers: SupplierPrice[];
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
// supplier stock codes, punctuation or repeated spaces.
export function productKey(description: string) {
  return description.toUpperCase()
    .replace(/^\s*[A-Z]{0,6}\d{3,}[A-Z0-9]*\s+/, "")      // leading stock code "51010 " / "CARTON1 "
    .replace(/[^A-Z0-9%./ ]+/g, " ")
    .replace(/\b(\d+)\s*(KG|G|L|LTR|LITRE|ML|CL|GAL)\b/g, "$1$2")
    .replace(/\s+/g, " ").trim();
}

export function comparePrices(rows: readonly PriceObservation[], options: { asOf: string; weeks?: number; thresholdPercent?: number }): PriceComparison {
  const weeks = options.weeks ?? 12, threshold = options.thresholdPercent ?? 10;
  const to = options.asOf, from = new Date(Date.parse(`${to}T00:00:00Z`) - weeks * 7 * 86400000).toISOString().slice(0, 10);
  const recent = rows.filter(row => row.issuedOn >= from && row.issuedOn <= to && row.unitPrice > 0 && row.quantity > 0 && productKey(row.description));
  const byProduct = new Map<string, PriceObservation[]>();
  for (const row of recent) {
    const key = `${row.currency}|${productKey(row.description)}`;
    const list = byProduct.get(key) ?? []; list.push(row); byProduct.set(key, list);
  }
  const newestFirst = (a: PriceObservation, b: PriceObservation) => b.issuedOn.localeCompare(a.issuedOn) || b.invoiceNumber.localeCompare(a.invoiceNumber) || b.lineId.localeCompare(a.lineId);
  const products: ProductComparison[] = [], alerts: PriceAlert[] = [];
  for (const [key, list] of byProduct) {
    const suppliers = new Map<string, PriceObservation[]>();
    for (const row of list) { const s = suppliers.get(row.supplierId) ?? []; s.push(row); suppliers.set(row.supplierId, s); }
    // Display name without the supplier's stock code ("51010 COBRA BEER KEG").
    const name = [...list].sort(newestFirst)[0].description.trim().replace(/^\s*[A-Za-z]{0,6}\d{3,}[A-Za-z0-9]*\s+(?=\S)/, "");
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
      key, name, currency: lastPaid.currency, suppliers: prices, bestSupplierId: best.supplierId, bestPrice, highestPrice,
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
