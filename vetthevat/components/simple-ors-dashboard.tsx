"use client";
// Simple ORS dashboard: what you buy, from whom, where you can save, and what
// changed in price. Built from the company's own saved supplier invoices.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, Camera, FileText, Package, PoundSterling, Scale, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { PayableInvoice } from "@/lib/bank-matching";
import type { PriceComparison } from "@/lib/price-comparison";

const money = (value: number, currency = "GBP") => new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(value);

export function SimpleOrsDashboard({ companyId, companyName }: { companyId: string; companyName?: string }) {
  const [invoices, setInvoices] = useState<PayableInvoice[] | null>(null);
  const [prices, setPrices] = useState<PriceComparison | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true; const headers = { "x-company-id": companyId };
    setInvoices(null); setPrices(null); setError("");
    const read = async (url: string) => { const r = await fetch(url, { headers, cache: "no-store" }); const b = await r.json().catch(() => null); if (!r.ok) throw new Error(b?.error?.message ?? "The dashboard could not be loaded."); return b.data; };
    read("/api/business/payable-invoices").then(d => { if (active) setInvoices(d.items); }).catch(e => { if (active) setError(e.message); });
    read("/api/business/price-comparison?weeks=12").then(d => { if (active) setPrices(d); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [companyId]);

  const topSuppliers = useMemo(() => {
    const since = new Date(Date.now() - 84 * 86400000).toISOString().slice(0, 10), totals = new Map<string, number>();
    for (const i of invoices ?? []) if (i.issuedOn >= since) totals.set(i.supplierName, (totals.get(i.supplierName) ?? 0) + i.gross);
    return [...totals].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [invoices]);
  const bestSavings = useMemo(() => (prices?.products ?? []).filter(p => p.potentialSaving > 0).sort((a, b) => b.potentialSaving - a.potentialSaving).slice(0, 5), [prices]);

  if (error) return <Card className="p-6"><p role="alert" className="text-sm text-red-800">{error}</p></Card>;
  const loading = invoices === null || prices === null, currency = prices?.totals.currency ?? "GBP";
  const maxSpend = topSuppliers[0]?.[1] ?? 1;

  return <div className="grid min-w-0 grid-cols-1 gap-5">
    <div><p className="font-serif text-3xl italic text-slate-800">Buy Smarter. Save More.</p><p className="text-sm text-muted">{companyName ? `${companyName} · ` : ""}Your purchasing at a glance, last 12 weeks</p></div>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {([[Package, loading ? "…" : String(prices!.totals.products), "Products you buy", "From your supplier invoices", "bg-blue-50 text-blue-700"],
        [Users, loading ? "…" : String(prices!.totals.suppliers), "Suppliers", "You bought from", "bg-indigo-50 text-indigo-700"],
        [PoundSterling, loading ? "…" : money(prices!.totals.potentialSaving, currency), "You could save", "At the cheapest prices", "bg-emerald-50 text-emerald-700"],
        [BarChart3, loading ? "…" : String(prices!.totals.alerts), "Price changes", "10% or more", "bg-amber-50 text-amber-700"]] as const).map(([Icon, value, label, hint, tone]) =>
        <Card key={label} className="flex items-center gap-3 p-4"><span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${tone}`}><Icon className="h-6 w-6" /></span>
          <div className="min-w-0"><p className="text-2xl font-bold tabular-nums">{value}</p><p className="text-sm font-semibold">{label}</p><p className="text-xs text-muted">{hint}</p></div></Card>)}
    </div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {([["/app/ors/prices", Scale, "Compare prices", "Find the cheapest supplier and order"],
        ["/app/ors/orders", Package, "Orders", "Sent to suppliers, mark delivered"],
        ["/app/ors/supplier-invoices/upload", Camera, "Scan supplier invoice", "Builds your product prices"],
        ["/app/ors/supplier-invoices", FileText, "Supplier invoices", "Everything you have saved"]] as const).map(([href, Icon, title, text]) =>
        <Link key={href} href={href} className="group flex items-center gap-3 rounded-xl border border-line bg-white p-4 hover:border-brand-500">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><Icon className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><span className="block font-semibold">{title}</span><span className="block text-xs text-muted">{text}</span></span>
          <ArrowRight className="h-4 w-4 text-muted group-hover:text-brand-700" /></Link>)}
    </div>

    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-5"><h3 className="font-bold">Top suppliers</h3><p className="text-xs text-muted">By amount spent</p>
        {loading ? <p className="mt-3 text-sm text-muted">Loading…</p> : topSuppliers.length ? <ul className="mt-3 grid gap-3">{topSuppliers.map(([name, total]) => <li key={name}>
          <div className="flex justify-between text-sm"><span className="font-semibold">{name}</span><span className="tabular-nums">{money(total)}</span></div>
          <div className="mt-1 h-2 rounded-full bg-wash"><div className="h-2 rounded-full bg-brand-600" style={{ width: `${Math.max(4, total / maxSpend * 100)}%` }} /></div></li>)}</ul>
          : <p className="mt-3 text-sm text-muted">No purchases in the last 12 weeks. <Link href="/app/ors/supplier-invoices/upload" className="font-semibold text-brand-700 underline">Scan a supplier invoice</Link>.</p>}
      </Card>
      <Card className="p-5"><h3 className="font-bold">Where you can save</h3><p className="text-xs text-muted">Buying at the cheapest supplier instead of your last one</p>
        {loading ? <p className="mt-3 text-sm text-muted">Loading…</p> : bestSavings.length ? <ul className="mt-3 grid gap-2">{bestSavings.map(p => <li key={p.key} className="flex items-center justify-between gap-3 border-t border-line pt-2 text-sm">
          <span className="min-w-0"><span className="block truncate font-semibold">{p.name}</span><span className="text-xs text-muted">Cheapest: {p.suppliers.find(s => s.cheapest)?.supplierName}</span></span>
          <span className="shrink-0 font-bold text-emerald-700 tabular-nums">Save {money(p.potentialSaving, p.currency)}</span></li>)}</ul>
          : <p className="mt-3 text-sm text-muted">Nothing to save yet. Savings appear when you buy the same product from more than one supplier.</p>}
      </Card>
    </div>

    <Card className="p-5"><div className="flex items-center justify-between"><h3 className="font-bold text-red-700">Price changes</h3><Link href="/app/ors/prices" className="text-sm font-semibold text-brand-700 underline">See all prices</Link></div>
      {loading ? <p className="mt-3 text-sm text-muted">Loading…</p> : prices!.alerts.length ? <ul className="mt-2">{prices!.alerts.slice(0, 5).map(a => <li key={a.key + a.supplierId} className="flex items-center justify-between gap-3 border-t border-line py-2 text-sm">
        <span className="min-w-0"><span className="block truncate font-semibold">{a.name}</span><span className="text-xs text-muted">{a.supplierName} · {money(a.previousPrice, a.currency)} → {money(a.currentPrice, a.currency)}</span></span>
        <span className={`shrink-0 font-bold ${a.changePercent > 0 ? "text-red-600" : "text-emerald-600"}`}>{a.changePercent > 0 ? "▲ Up" : "▼ Down"} {Math.abs(a.changePercent)}%</span></li>)}</ul>
        : <p className="mt-3 text-sm text-muted">No price has changed by 10% or more in the last 12 weeks.</p>}
    </Card>
  </div>;
}
