"use client";
// ORS view of the company's supplier invoices. These are the same purchase
// invoices saved from VAT (one record, used by both VAT and ORS), so an invoice
// scanned once appears here, in price comparison and in bank matching.
import {ukDate} from "@/lib/uk-date";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Camera, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { PayableInvoice } from "@/lib/bank-matching";

const money = (value: number, currency = "GBP") => new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(value);

export function OrsPurchaseInvoices({ companyId }: { companyId: string }) {
  const [rows, setRows] = useState<PayableInvoice[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    let active = true; setRows(null); setError("");
    fetch("/api/business/payable-invoices", { headers: { "x-company-id": companyId }, cache: "no-store" })
      .then(async r => { const b = await r.json(); if (!r.ok) throw new Error(b?.error?.message ?? "Supplier invoices could not be loaded."); if (active) setRows(b.data.items); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : "Supplier invoices could not be loaded."); });
    return () => { active = false; };
  }, [companyId]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter(i => !q || i.supplierName.toLowerCase().includes(q) || i.number.toLowerCase().includes(q));
  }, [rows, query]);
  const total = visible.reduce((s, i) => s + i.gross, 0), vat = visible.reduce((s, i) => s + i.vat, 0);

  return <Card className="min-w-0 p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-bold">Supplier invoices</h2><p className="text-sm text-muted">Saved once, used for VAT and ORS · {rows ? `${visible.length} invoices · ${money(total)} · VAT ${money(vat)}` : "loading…"}</p></div>
      <Link href="/app/ors/supplier-invoices/upload" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-700 px-4 text-sm font-semibold text-white"><Camera className="h-4 w-4" />Scan or upload invoice</Link>
    </div>
    <label className="mt-4 flex items-center gap-2 rounded-lg border border-line px-3"><Search className="h-4 w-4 text-muted" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search supplier or invoice number" aria-label="Search supplier invoices" className="h-11 w-full bg-transparent text-sm outline-none" /></label>
    {error ? <p role="alert" className="mt-4 text-sm text-red-800">{error}</p> : null}
    {rows && !visible.length ? <p className="mt-6 rounded-lg bg-wash p-6 text-center text-sm text-muted">{rows.length ? "No invoices match your search." : "No supplier invoices yet. Scan your first invoice to start building your product prices."}</p> : null}
    {visible.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm">
      <thead className="text-xs text-muted"><tr><th className="py-2">Supplier</th><th>Invoice</th><th>Date</th><th className="text-right">Net</th><th className="text-right">VAT</th><th className="text-right">Total</th></tr></thead>
      <tbody>{visible.map(i => <tr key={i.id} className="border-t border-line">
        <td className="py-3 pr-3 font-semibold">{i.supplierName}</td>
        <td><Link href={`/app/invoices/${i.id}`} className="font-semibold text-brand-700 underline">{i.number}</Link></td>
        <td className="whitespace-nowrap">{ukDate(i.issuedOn)}</td>
        <td className="text-right tabular-nums">{money(i.net, i.currency)}</td><td className="text-right tabular-nums">{money(i.vat, i.currency)}</td><td className="text-right font-semibold tabular-nums">{money(i.gross, i.currency)}</td>
      </tr>)}</tbody></table></div> : null}
  </Card>;
}
