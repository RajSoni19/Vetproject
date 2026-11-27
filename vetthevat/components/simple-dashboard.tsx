"use client";
// Minimal one-stop dashboard from the company's own saved purchase invoices.
import {ukDate} from "@/lib/uk-date";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Camera, FileText, Landmark, PoundSterling, Receipt, Scale, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { PayableInvoice } from "@/lib/bank-matching";

type Period = "month" | "quarter" | "year" | "custom";
const money = (value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
function periodStart(period: Exclude<Period, "custom">) {
  const now = new Date(), y = now.getUTCFullYear(), m = now.getUTCMonth();
  const start = period === "month" ? new Date(Date.UTC(y, m, 1)) : period === "quarter" ? new Date(Date.UTC(y, m - (m % 3), 1)) : new Date(Date.UTC(y, m - 11, 1));
  return start.toISOString().slice(0, 10);
}

export function SimpleDashboard({ companyId, companyName }: { companyId: string; companyName?: string }) {
  const [invoices, setInvoices] = useState<PayableInvoice[] | null>(null);
  const [alerts, setAlerts] = useState<number | null>(null);
  const [period, setPeriod] = useState<Period>("quarter");
  const todayIso = new Date().toISOString().slice(0, 10);
  const [customFrom, setCustomFrom] = useState(() => periodStart("quarter")), [customTo, setCustomTo] = useState(todayIso);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true; const headers = { "x-company-id": companyId };
    setInvoices(null); setError("");
    fetch("/api/business/payable-invoices", { headers, cache: "no-store" })
      .then(async r => { const b = await r.json(); if (!r.ok) throw new Error(b?.error?.message ?? "Dashboard could not be loaded."); if (active) setInvoices(b.data.items); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : "Dashboard could not be loaded."); });
    fetch("/api/business/price-comparison?weeks=12", { headers, cache: "no-store" })
      .then(async r => { const b = await r.json(); if (active && r.ok) setAlerts(b.data.totals.alerts); }).catch(() => undefined);
    return () => { active = false; };
  }, [companyId]);

  const stats = useMemo(() => {
    // Custom: inclusive From and To dates; swapped if entered the wrong way round.
    const [from, to] = period === "custom" ? [customFrom, customTo].sort() : [periodStart(period), "9999-12-31"];
    const list = (invoices ?? []).filter(i => i.issuedOn >= from && i.issuedOn <= to);
    const sum = (pick: (i: PayableInvoice) => number) => Math.round(list.reduce((s, i) => s + pick(i), 0) * 100) / 100;
    return { vat: sum(i => i.vat), gross: sum(i => i.gross), count: list.length, suppliers: new Set(list.map(i => i.supplierName)).size };
  }, [invoices, period, customFrom, customTo]);

  if (error) return <Card className="p-6"><p role="alert" className="text-sm text-red-800">{error}</p></Card>;
  const loading = invoices === null;
  const tiles: [typeof Receipt, string, string, string][] = [
    [Receipt, "VAT to claim", loading ? "…" : money(stats.vat), "On saved purchase invoices"],
    [PoundSterling, "Purchases", loading ? "…" : money(stats.gross), `${stats.suppliers} suppliers`],
    [FileText, "Invoices", loading ? "…" : String(stats.count), "Saved in this period"],
    [TrendingUp, "Price alerts", alerts === null ? "…" : String(alerts), "10%+ changes, last 12 weeks"]
  ];

  return <div className="grid min-w-0 grid-cols-1 gap-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-bold">{companyName ? `Welcome back, ${companyName}` : "Overview"}</h2>
      <div className="flex rounded-lg border border-line bg-white p-1 text-sm" role="tablist" aria-label="Period">
        {([["month", "This month"], ["quarter", "This quarter"], ["year", "12 months"], ["custom", "Custom dates"]] as [Period, string][]).map(([value, label]) =>
          <button key={value} type="button" role="tab" aria-selected={period === value} onClick={() => setPeriod(value)} className={`min-h-9 rounded-md px-3 font-semibold ${period === value ? "bg-brand-700 text-white" : "text-muted"}`}>{label}</button>)}
      </div>
    </div>
    {period === "custom" ? <div className="flex flex-wrap items-end justify-end gap-3">
      <label className="grid gap-1 text-xs font-semibold">From<input type="date" className="field-control" value={customFrom} max={customTo || undefined} onChange={e => setCustomFrom(e.target.value)} /></label>
      <label className="grid gap-1 text-xs font-semibold">To<input type="date" className="field-control" value={customTo} min={customFrom || undefined} onChange={e => setCustomTo(e.target.value)} /></label>
    </div> : null}

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map(([Icon, label, value, hint]) => <Card key={label} className="stat-tile p-4">
        <div className="flex items-center justify-between"><p className="text-sm font-semibold text-muted">{label}</p><Icon className="h-4 w-4 text-brand-700" aria-hidden /></div>
        <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p><p className="text-xs text-muted">{hint}</p></Card>)}
    </div>

    <div className="grid gap-3 sm:grid-cols-3">
      {([["/app/invoices/upload", Camera, "Scan an invoice", "Photo or PDF — details read for you"],
        ["/app/ors/prices", Scale, "Compare prices", "Cheapest supplier for each product"],
        ["/app/bank-matching", Landmark, "Match bank payments", "See the VAT in each payment"]] as const).map(([href, Icon, title, text]) =>
        <Link key={href} href={href} className="quick-link group flex items-center gap-3 rounded-xl border border-line bg-white p-4 hover:border-brand-500">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><Icon className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><span className="block font-semibold">{title}</span><span className="block text-xs text-muted">{text}</span></span>
          <ArrowRight className="h-4 w-4 text-muted group-hover:text-brand-700" /></Link>)}
    </div>

    <Card className="p-5">
      <div className="flex items-center justify-between"><h3 className="font-bold">Latest invoices</h3><Link href="/app/invoices" className="text-sm font-semibold text-brand-700 underline">View all</Link></div>
      {loading ? <p className="mt-3 text-sm text-muted">Loading…</p> : invoices!.length ? <ul className="mt-2">{invoices!.slice(0, 6).map(i => <li key={i.id} className="flex items-center justify-between gap-3 border-t border-line py-3 text-sm">
        <Link href={`/app/invoices/${i.id}`} className="min-w-0"><span className="block truncate font-semibold"><span translate="no" data-vtv-name="">{i.supplierName}</span></span><span className="text-xs text-muted">{i.number} · {ukDate(i.issuedOn)}</span></Link>
        <span className="shrink-0 text-right tabular-nums"><span className="block font-semibold">{money(i.gross)}</span><span className="text-xs text-muted">VAT {money(i.vat)}</span></span></li>)}</ul>
        : <p className="mt-3 text-sm text-muted">No invoices yet. <Link href="/app/invoices/upload" className="font-semibold text-brand-700 underline">Scan your first invoice</Link>.</p>}
    </Card>
  </div>;
}
