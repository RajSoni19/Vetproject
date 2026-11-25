"use client";
// ORS price comparison from the company's own purchase invoices (last N weeks):
// cheapest supplier per product, price-change alerts, and an order list that is
// grouped by supplier and sent on WhatsApp.
import {ukDate} from "@/lib/uk-date";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, BarChart3, CheckCircle2, ChevronRight, Download, FileText, Minus, MessageCircle, Package, Plus, PoundSterling, RefreshCw, Search, Send, ShoppingCart, Trash2, Users, X } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { matchesProductSearch, type PriceComparison, type ProductComparison } from "@/lib/price-comparison";
import { normalizePhone, whatsappNumber, whatsappOrderMessage, type SupplierOrder } from "@/lib/supplier-orders";
import { SupplierOrderHistory } from "@/components/supplier-order-history";

type OrderLine = { key: string; name: string; supplierId: string; supplierName: string; unitPrice: number; quantity: number; currency: string };
type Group = { supplierId: string; supplierName: string; lines: OrderLine[]; total: number };
const money = (value: number, currency = "GBP") => new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(value);
const storageKey = (companyId: string) => `vtv-order-list:${companyId}`;
// Pack size printed in the product name: "5kg", "24x330ml", "10L", "18 PACK".
function packSize(name: string) {
  return name.match(/\b\d+\s*x\s*\d+(?:\.\d+)?\s*(?:ml|cl|l|g|kg)\b|\b\d+(?:\.\d+)?\s*(?:kg|g|ml|cl|l|ltr|litre|gal)\b|\b\d+\s*(?:pack|pk|pcs|bunch(?:es)?|box(?:es)?|cans?|bottles?)\b/i)?.[0].replace(/\s+/g, " ") ?? "—";
}
function unitOf(name: string) {
  const p = packSize(name).toLowerCase();
  return /kg|g\b/.test(p) ? "kg" : /\bl\b|ltr|litre|ml|cl/.test(p) ? "litre" : /pack|pk|x/.test(p) ? "pack" : /box/.test(p) ? "box" : /bunch/.test(p) ? "bunch" : "each";
}

// "Cheapest" only when one supplier really is cheaper: not for a single price, nor for equal prices.
const cheaperExists = (product: ProductComparison) => product.suppliers.length > 1 && product.bestPrice < product.highestPrice;

export function SupplierPriceComparison({ companyId, companyName }: { companyId: string; companyName?: string }) {
  const [data, setData] = useState<PriceComparison | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  // Ordering needs every product bought recently, not only the last few weeks: an invoice dated a
  // few months back (scanned today) must still offer its items. Default one year; the choice is
  // remembered on this device.
  const [weeks, setWeeksState] = useState(52);
  useEffect(() => { try { const saved = Number(window.localStorage.getItem("vtv.price-weeks.v1")); if ([10, 12, 26, 52, 104].includes(saved)) setWeeksState(saved); } catch { /* storage blocked */ } }, []);
  const setWeeks = (value: number) => { setWeeksState(value); try { window.localStorage.setItem("vtv.price-weeks.v1", String(value)); } catch { /* storage blocked */ } };
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<OrderLine[]>([]);
  const [notice, setNotice] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [companyPhone, setCompanyPhone] = useState<string | null>(null);
  const [editingPhone, setEditingPhone] = useState(false);
  // Close the cart panel once it is empty (after sending, or clearing).
  useEffect(() => { if (!order.length) setCartOpen(false); }, [order.length]);
  // Short messages disappear by themselves.
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 6000); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    let active = true;
    fetch("/api/business/company-contact", { headers: { "x-company-id": companyId }, cache: "no-store" }).then(r => r.ok ? r.json() : null).then(b => { if (active) setCompanyPhone(b?.data?.phone ?? null); }).catch(() => undefined);
    return () => { active = false; };
  }, [companyId]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/business/price-comparison?weeks=${weeks}&threshold=10`, { headers: { "x-company-id": companyId }, cache: "no-store", signal: AbortSignal.timeout(30000) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message ?? "Price comparison could not be loaded.");
      setData(body.data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Price comparison could not be loaded."); }
    finally { setLoading(false); }
  }, [companyId, weeks]);
  useEffect(() => { void load(); }, [load]);
  // The order list is a working draft on this device until it is sent; sent
  // orders are saved in the database as order history.
  useEffect(() => { try { setOrder(JSON.parse(localStorage.getItem(storageKey(companyId)) ?? "[]")); } catch { setOrder([]); } }, [companyId]);
  const saveOrder = (next: OrderLine[] | ((current: OrderLine[]) => OrderLine[])) => setOrder(current => {
    const value = typeof next === "function" ? next(current) : next;
    try { localStorage.setItem(storageKey(companyId), JSON.stringify(value)); } catch { /* storage unavailable */ }
    return value;
  });
  const [historyToken, setHistoryToken] = useState(0);
  async function mutate<T = SupplierOrder>(url: string, method: "POST" | "PATCH" | "PUT", body: unknown): Promise<T> {
    const session = await fetch("/api/auth/session", { cache: "no-store" });
    if (!session.ok) throw new Error("Please sign in again.");
    const csrf = (await session.json()).csrfToken;
    const response = await fetch(url, { method, headers: { "x-company-id": companyId, "x-csrf-token": csrf, "idempotency-key": crypto.randomUUID(), "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error?.message ?? "The order could not be saved.");
    return result.data as T;
  }
  // Save the order, then take its items off the draft list.
  async function recordOrder(group: Group, channel: "whatsapp") {
    const saved = await mutate("/api/business/supplier-orders", "POST", { supplierId: group.supplierId || null, supplierName: group.supplierName, channel, currency: group.lines[0]?.currency ?? "GBP", lines: group.lines.map(line => ({ name: line.name, quantity: line.quantity, unitPrice: line.unitPrice })) });
    const sentKeys = new Set(group.lines.map(line => line.key));
    saveOrder(current => current.filter(line => !(sentKeys.has(line.key) && line.supplierId === group.supplierId)));
    setHistoryToken(n => n + 1);
    return saved;
  }

  const products = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.products ?? []).filter(p => !q || matchesProductSearch([p.name, ...(p.aliases ?? [])], q) || p.suppliers.some(s => s.supplierName.toLowerCase().includes(q)));
  }, [data, query]);
  // Columns: the suppliers of the products on screen (most products first), so a product bought
  // only from a smaller supplier still shows its price; at most 6 columns fit the table.
  const supplierColumns = useMemo(() => {
    const count = new Map<string, number>();
    for (const product of products) for (const price of product.suppliers) count.set(price.supplierId, (count.get(price.supplierId) ?? 0) + 1);
    return (data?.suppliers ?? []).filter(s => count.has(s.id)).sort((a, b) => count.get(b.id)! - count.get(a.id)! || a.name.localeCompare(b.name)).slice(0, 6);
  }, [data, products]);
  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const line of order) {
      const group = map.get(line.supplierId) ?? { supplierId: line.supplierId, supplierName: line.supplierName, lines: [], total: 0 };
      group.lines.push(line); group.total += line.unitPrice * line.quantity; map.set(line.supplierId, group);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [order]);
  const orderTotal = order.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const orderAtHighest = order.reduce((sum, line) => { const product = data?.products.find(p => p.key === line.key); return sum + (product?.highestPrice ?? line.unitPrice) * line.quantity; }, 0);
  // Recommendation only from products bought from 2+ suppliers.
  const compared = (data?.products ?? []).filter(cheaperExists);
  const recommendation = (() => {
    const counts = new Map<string, { name: string; wins: number; saving: number }>();
    for (const p of compared) { const best = p.suppliers.find(s => s.cheapest)!; const entry = counts.get(best.supplierId) ?? { name: best.supplierName, wins: 0, saving: 0 }; entry.wins++; entry.saving += p.potentialSaving; counts.set(best.supplierId, entry); }
    return [...counts.values()].sort((a, b) => b.wins - a.wins || b.saving - a.saving)[0];
  })();

  function add(product: ProductComparison, supplierId = product.bestSupplierId) {
    const price = product.suppliers.find(s => s.supplierId === supplierId)!;
    const existing = order.find(line => line.key === product.key);
    if (existing && existing.supplierId === supplierId) saveOrder(order.map(line => line === existing ? { ...line, quantity: line.quantity + 1 } : line));
    else saveOrder([...order.filter(line => line.key !== product.key), { key: product.key, name: product.name, supplierId, supplierName: price.supplierName, unitPrice: price.latestPrice, quantity: existing?.quantity ?? Math.max(1, price.lastQuantity), currency: product.currency }]);
  }
  // + / - on a product or cart line; going below 1 removes it.
  const bump = (key: string, delta: number) => saveOrder(current => current.flatMap(line => line.key !== key ? [line] : line.quantity + delta <= 0 ? [] : [{ ...line, quantity: Math.min(9999, line.quantity + delta) }]));
  async function saveCompanyPhone(raw: string) {
    const phone = normalizePhone(raw);
    if (!phone) return "Enter a valid mobile number, for example 07306 361031.";
    try { await mutate("/api/business/company-contact", "PUT", { phone }); setCompanyPhone(phone); setEditingPhone(false); return ""; }
    catch (reason) { return reason instanceof Error ? reason.message : "The number could not be saved."; }
  }
  // Every WhatsApp order goes to the one business number saved for this company.
  const whatsappUrl = (text: string) => `https://wa.me/${whatsappNumber(companyPhone)}?text=${encodeURIComponent(text)}`;
  // The WhatsApp tab is opened straight away (browsers block pop-ups opened
  // later), then pointed at the message once the order number is saved.
  async function sendWhatsapp(group: Group, tab = window.open("", "_blank")) {
    try {
      const saved = await recordOrder(group, "whatsapp");
      const url = whatsappUrl(whatsappOrderMessage({ ...group, currency: saved.currency }, companyName, saved.number));
      if (tab) tab.location.href = url; else window.open(url, "_blank", "noopener,noreferrer");
      setNotice(`Order ${saved.number} for ${group.supplierName} saved and opened in WhatsApp — press Send there.`);
      return true;
    } catch (reason) { tab?.close(); setNotice(reason instanceof Error ? reason.message : "The order could not be saved."); return false; }
  }
  // One send at a time, so a double click never saves the same order twice.
  const [busy, setBusy] = useState(false);
  const once = (task: () => Promise<unknown>) => { if (busy) return; setBusy(true); void task().finally(() => setBusy(false)); };
  async function sendAll() {
    if (!groups.length) return;
    const tabs = groups.map(() => window.open("", "_blank"));
    const results = await Promise.all(groups.map((group, index) => sendWhatsapp(group, tabs[index])));
    const ok = results.filter(Boolean).length, failed = results.length - ok;
    setNotice(failed ? `${ok} of ${results.length} orders saved and opened in WhatsApp. ${failed} could not be saved — they are still in your order list, try again.` : `${ok} order${ok === 1 ? "" : "s"} saved and opened in WhatsApp — press Send in each.`);
  }
  function downloadPOs() {
    // Purchase orders go to suppliers, so they list only items and quantities (no prices).
    const rows = ["Supplier,Product,Quantity", ...groups.flatMap(g => g.lines.map(line => `"${g.supplierName.replace(/"/g, '""')}","${line.name.replace(/"/g, '""')}",${line.quantity}`))];
    const url = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" })), a = document.createElement("a");
    a.href = url; a.download = `purchase-orders-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (loading && !data) return <Card className="p-6 text-sm text-muted"><RefreshCw className="mr-2 inline h-4 w-4 animate-spin" />Loading supplier prices…</Card>;
  if (error) return <Card className="p-6"><p role="alert" className="text-sm text-red-800">{error}</p><Button className="mt-3" variant="outline" onClick={() => void load()}>Retry</Button></Card>;
  if (!data) return null;
  const currency = data.totals.currency;

  return <div className="grid min-w-0 grid-cols-1 gap-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="font-serif text-3xl italic text-slate-800">Buy Smarter. Save More.</p><p className="text-sm text-muted">Prices from your own supplier invoices · last {data.window.weeks} weeks</p></div>
      <select aria-label="Period" value={weeks} onChange={e => setWeeks(Number(e.target.value))} className="field-control h-10 w-auto"><option value={10}>Last 10 weeks</option><option value={12}>Last 12 weeks</option><option value={26}>Last 26 weeks</option><option value={52}>Last year</option><option value={104}>Last 2 years</option></select>
    </div>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {([[Package, String(data.totals.products), "Total products", "Across all suppliers", "bg-blue-50 text-blue-700"],
        [Users, String(data.totals.suppliers), "Active suppliers", "From your invoices", "bg-indigo-50 text-indigo-700"],
        [PoundSterling, money(data.totals.potentialSaving, currency), "Estimated savings", "Buying at the cheapest price", "bg-emerald-50 text-emerald-700"],
        [BarChart3, String(data.totals.alerts), "Price changes", `${data.window.thresholdPercent}%+ in ${data.window.weeks} weeks`, "bg-amber-50 text-amber-700"]] as const).map(([Icon, value, label, hint, tone]) =>
        <Card key={label} className="flex items-center gap-3 p-4"><span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${tone}`}><Icon className="h-6 w-6" /></span>
          <div className="min-w-0"><p className="text-2xl font-bold tabular-nums">{value}</p><p className="text-sm font-semibold">{label}</p><p className="text-xs text-muted">{hint}</p></div></Card>)}
    </div>

    {!data.products.length ? <Card className="p-6"><h2 className="text-lg font-bold">No supplier prices yet</h2>
      <p className="mt-2 text-sm text-muted">Prices come from your saved supplier invoices. Scan an invoice and each line becomes a product price here.</p>
      <Link href="/app/ors/supplier-invoices/upload" className="mt-3 inline-block text-sm font-semibold text-brand-700 underline">Scan a supplier invoice</Link></Card> : null}

    {data.products.length ? <div className="grid min-w-0 gap-5 xl:grid-cols-[1fr_340px]">
      <Card className="min-w-0 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Supplier price comparison</h2>
          <label className="flex w-full min-w-0 items-center gap-2 rounded-lg border border-line px-3 sm:w-auto"><Search className="h-4 w-4 text-muted" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search for a product (e.g. chicken, milk…)" aria-label="Search products" className="h-10 w-full min-w-0 bg-transparent text-sm outline-none sm:w-64" /></label>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs text-muted"><tr><th className="py-2 pr-3">Product</th><th className="px-2">Pack size</th>{supplierColumns.map(s => <th key={s.id} className="px-2">{s.name}</th>)}<th className="px-2">Best price</th><th /></tr></thead>
            <tbody>{products.map(product => {
              const inOrder = order.find(line => line.key === product.key);
              return <tr key={product.key} className="border-t border-line align-middle">
                <td className="py-3 pr-3 font-semibold">{product.name}{product.aliases?.length ? <span className="block text-xs font-normal text-muted" title="Different spellings on supplier invoices, compared as one product">Also: {product.aliases.join(", ")}</span> : null}</td>
                <td className="px-2 text-muted">{packSize(product.name)}</td>
                {supplierColumns.map(s => { const price = product.suppliers.find(p => p.supplierId === s.id);
                  return <td key={s.id} className="px-2 py-2">{price ? <button type="button" onClick={() => add(product, s.id)} title={`Order from ${s.name}`} className={`w-full rounded-lg px-2 py-1.5 text-center tabular-nums ${price.cheapest && cheaperExists(product) ? "border-2 border-emerald-400 bg-emerald-50" : "hover:bg-wash"}`}>
                    <span className="inline-flex items-center gap-0.5 font-semibold">{money(price.latestPrice, product.currency)}
                      {price.changePercent !== null && Math.abs(price.changePercent) >= 0.1 ? price.changePercent > 0 ? <ArrowUp className="h-3.5 w-3.5 text-red-600" aria-label="price up" /> : <ArrowDown className="h-3.5 w-3.5 text-emerald-600" aria-label="price down" /> : null}</span>
                    <span className="block text-[11px] text-muted">{ukDate(price.latestOn)}</span>
                    {price.cheapest && cheaperExists(product) ? <span className="mt-0.5 inline-block rounded bg-emerald-600 px-1.5 text-[10px] font-bold text-white">Cheapest</span> : null}</button> : <span className="block text-center text-muted">—</span>}</td>; })}
                <td className="px-2 tabular-nums"><span className="font-bold">{money(product.bestPrice, product.currency)}</span><span className="block max-w-40 truncate text-[11px] text-muted" title={product.suppliers.find(p => p.supplierId === product.bestSupplierId)?.supplierName}>{product.suppliers.find(p => p.supplierId === product.bestSupplierId)?.supplierName}</span>{product.savingPercent > 0 ? <span className="block text-xs font-semibold text-emerald-700">Save {product.savingPercent}%</span> : null}</td>
                <td className="py-2">{inOrder ? <Stepper value={inOrder.quantity} name={product.name} onMinus={() => bump(inOrder.key, -1)} onPlus={() => bump(inOrder.key, 1)} /> : <Button type="button" variant="outline" className="min-h-9 whitespace-nowrap px-3 text-xs font-bold text-emerald-700" onClick={() => add(product)} aria-label={`Add ${product.name} to order`}>ADD</Button>}</td>
              </tr>; })}</tbody>
          </table>
        </div>
      </Card>

      <div className="grid content-start gap-5">
        <Card className="p-5"><h2 className="font-bold text-red-700">Price alerts</h2>
          {data.alerts.length ? <table className="mt-3 w-full text-xs"><thead className="text-muted"><tr><th className="text-left">Product</th><th className="text-right">Last</th><th className="text-right">Now</th><th className="text-right">Change</th></tr></thead>
            <tbody>{data.alerts.slice(0, 6).map(alert => <tr key={alert.key + alert.supplierId} className="border-t border-line"><td className="py-2 pr-1 font-semibold">{alert.name}<span className="block font-normal text-muted">{alert.supplierName}</span></td><td className="text-right tabular-nums">{money(alert.previousPrice, alert.currency)}</td><td className="text-right tabular-nums">{money(alert.currentPrice, alert.currency)}</td>
              <td className={`text-right font-bold ${alert.changePercent > 0 ? "text-red-600" : "text-emerald-600"}`}>{alert.changePercent > 0 ? "▲" : "▼"} {Math.abs(alert.changePercent)}%</td></tr>)}</tbody></table>
            : <p className="mt-2 text-sm text-muted">No price changes of {data.window.thresholdPercent}% or more in the last {data.window.weeks} weeks.</p>}
        </Card>
        <Card className="border-emerald-200 bg-emerald-50 p-5"><h2 className="font-bold">ORS recommendation</h2>
          {recommendation ? <div className="mt-3 flex items-start gap-3"><CheckCircle2 className="h-8 w-8 shrink-0 text-emerald-600" /><div><p className="font-bold">Buy from {recommendation.name}</p><p className="text-sm text-slate-700">Cheapest for {recommendation.wins} of {compared.length} products you buy from more than one supplier{recommendation.saving > 0 ? ` — about ${money(recommendation.saving, currency)} saving on your usual quantities` : ""}.</p></div></div>
            : <p className="mt-2 text-sm text-slate-700">Buy the same product from two or more suppliers and ORS will tell you who is cheapest.</p>}
        </Card>
        <Card className="p-5"><h2 className="font-bold text-brand-800">Create orders automatically</h2>
          <ol className="mt-3 grid gap-2 text-sm">{([[ShoppingCart, "Add items to your order list"], [Search, "ORS finds the cheapest supplier"], [FileText, "Items are grouped by supplier"], [Send, "Send each order on WhatsApp"]] as const).map(([Icon, text], index) =>
            <li key={text} className="flex items-center gap-2"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-700 text-xs font-bold text-white">{index + 1}</span><Icon className="h-4 w-4 text-muted" />{text}</li>)}</ol>
        </Card>
      </div>
    </div> : null}

    <SupplierOrderHistory companyId={companyId} companyName={companyName} reloadToken={historyToken} />

    {notice ? <p role="status" className={`fixed inset-x-3 z-[60] mx-auto max-w-xl rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-xl lg:left-[260px] ${order.length && !cartOpen ? "bottom-20" : "bottom-4"}`}>{notice}</p> : null}

    {order.length && !cartOpen ? <button type="button" onClick={() => setCartOpen(true)} className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-2xl bg-brand-700 px-4 py-3 text-left text-white shadow-xl hover:bg-brand-800 lg:left-[260px]" aria-label="View cart">
      <span className="flex items-center gap-3"><ShoppingCart className="h-6 w-6" /><span><span className="block text-xs font-semibold opacity-90">{order.reduce((n, l) => n + l.quantity, 0)} item{order.reduce((n, l) => n + l.quantity, 0) === 1 ? "" : "s"} · {groups.length} supplier{groups.length === 1 ? "" : "s"}</span><span className="block text-lg font-bold tabular-nums">{money(orderTotal, currency)}</span></span></span>
      <span className="flex items-center gap-1 font-bold">View cart<ChevronRight className="h-5 w-5" /></span></button> : null}

    {cartOpen ? <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Your cart" onKeyDown={e => { if (e.key === "Escape") setCartOpen(false); }}>
      <button type="button" aria-label="Close cart" className="absolute inset-0 bg-black/40" onClick={() => setCartOpen(false)} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-line p-4"><h2 className="text-xl font-bold">Your cart <span className="ml-1 rounded bg-brand-700 px-2 py-0.5 text-xs text-white">{order.reduce((n, l) => n + l.quantity, 0)}</span></h2>
          <div className="flex items-center gap-1">{order.length ? <button type="button" className="rounded-md px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50" onClick={() => { if (window.confirm("Remove everything from the cart?")) saveOrder([]); }}>Clear</button> : null}
            <button type="button" aria-label="Close cart" className="grid h-9 w-9 place-items-center rounded-md hover:bg-wash" onClick={() => setCartOpen(false)}><X className="h-5 w-5" /></button></div></div>
        <div className="grid flex-1 content-start gap-4 overflow-y-auto p-4">
          {!companyPhone || editingPhone ? <PhoneAsk label="WhatsApp number for orders" help="Every WhatsApp order opens to this number." onSave={saveCompanyPhone} /> : <p className="flex flex-wrap items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900"><MessageCircle className="h-4 w-4 shrink-0" />Orders go to WhatsApp <strong>{companyPhone}</strong><button type="button" className="ml-auto text-xs font-semibold underline" onClick={() => setEditingPhone(true)}>Change</button></p>}
          {groups.map(group => {
            return <section key={group.supplierId} className="rounded-xl border border-line p-3">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words font-bold leading-tight">{group.supplierName}</p></div><p className="shrink-0 font-bold tabular-nums">{money(group.total, currency)}</p></div>
              <ul className="mt-2 divide-y divide-line">{group.lines.map(line => <li key={line.key} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold leading-tight">{line.name}</p><p className="text-xs text-muted">{money(line.unitPrice, line.currency)} each · {unitOf(line.name)}</p></div>
                <Stepper value={line.quantity} name={line.name} onMinus={() => bump(line.key, -1)} onPlus={() => bump(line.key, 1)} />
                <p className="w-16 shrink-0 text-right text-sm font-bold tabular-nums">{money(line.unitPrice * line.quantity, line.currency)}</p></li>)}</ul>
              <div className="mt-2 flex gap-2">
                <Button type="button" disabled={busy} className="min-h-10 flex-1 bg-brand-700 text-sm" onClick={() => { const tab = window.open("", "_blank"); once(() => sendWhatsapp(group, tab)); }} title={companyPhone ? `WhatsApp ${companyPhone}` : "Add your WhatsApp number first"}><MessageCircle className="h-4 w-4" />Order on WhatsApp</Button>

              </div></section>; })}
        </div>
        <div className="grid gap-3 border-t border-line bg-wash p-4">
          <div className="flex items-end justify-between"><div><p className="text-xs text-muted">Total order value</p><p className="text-2xl font-bold tabular-nums">{money(orderTotal, currency)}</p></div>
            {orderAtHighest > orderTotal ? <p className="text-right text-sm font-bold text-emerald-700">You save {money(orderAtHighest - orderTotal, currency)} ({Math.round((orderAtHighest - orderTotal) / orderAtHighest * 100)}%)<span className="block text-xs font-normal text-muted">vs highest prices</span></p> : null}</div>
          <Button type="button" disabled={busy || !groups.length} className="min-h-12 bg-brand-700 text-base" onClick={() => once(sendAll)}><Send className="h-5 w-5" />{busy ? "Saving…" : groups.length > 1 ? `Send all ${groups.length} orders on WhatsApp` : "Send order on WhatsApp"}</Button>
          <Button type="button" variant="outline" className="min-h-9 px-2 text-xs" onClick={downloadPOs}><Download className="h-4 w-4 shrink-0" />Download POs (CSV)</Button>
        </div>
      </aside></div> : null}
  </div>;
}

// Quick + / - quantity control (going below 1 removes the item).
function Stepper({ value, name, onMinus, onPlus }: { value: number; name: string; onMinus: () => void; onPlus: () => void }) {
  return <span className="inline-flex shrink-0 items-center rounded-lg bg-brand-700 text-white" role="group" aria-label={`Quantity of ${name}`}>
    <button type="button" onClick={onMinus} aria-label={`Less ${name}`} className="grid h-9 w-9 place-items-center rounded-l-lg hover:bg-brand-800">{value <= 1 ? <Trash2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}</button>
    <span className="min-w-7 text-center text-sm font-bold tabular-nums" aria-live="polite">{value}</span>
    <button type="button" onClick={onPlus} aria-label={`More ${name}`} className="grid h-9 w-9 place-items-center rounded-r-lg hover:bg-brand-800"><Plus className="h-4 w-4" /></button></span>;
}

// Small "add a mobile number" box with its own validation message.
function PhoneAsk({ label, help, onSave }: { label: string; help: string; onSave: (value: string) => Promise<string> }) {
  const [value, setValue] = useState(""), [error, setError] = useState(""), [saving, setSaving] = useState(false);
  return <form className="rounded-lg bg-amber-50 p-3" onSubmit={async event => { event.preventDefault(); setSaving(true); setError(await onSave(value)); setSaving(false); }}>
    <label className="block text-xs font-semibold text-amber-900">{label}
      <span className="mt-1 flex gap-2"><input type="tel" inputMode="tel" autoComplete="tel" value={value} onChange={e => setValue(e.target.value)} placeholder="07306 361031" maxLength={25} required className="field-control h-9 min-w-0 flex-1 text-sm" />
        <Button type="submit" disabled={saving} className="min-h-9 px-3 text-xs">{saving ? "Saving…" : "Save"}</Button></span></label>
    <p className="mt-1 text-xs text-amber-900/80">{help}</p>{error ? <p role="alert" className="mt-1 text-xs font-semibold text-red-700">{error}</p> : null}</form>;
}

