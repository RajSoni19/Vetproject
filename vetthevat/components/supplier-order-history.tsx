"use client";
// Every order sent to a supplier (on WhatsApp), from the database.
// Used on the Orders page and under Price Comparison, so both always agree.
import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { whatsappNumber, whatsappOrderMessage, type SupplierOrder } from "@/lib/supplier-orders";

const money = (value: number, currency = "GBP") => new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(value);

export function SupplierOrderHistory({ companyId, companyName, reloadToken = 0, title = "Order history" }: { companyId: string; companyName?: string; reloadToken?: number; title?: string }) {
  const [orders, setOrders] = useState<SupplierOrder[] | null>(null);
  const [companyPhone, setCompanyPhone] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState("");
  const [filter, setFilter] = useState<"all" | SupplierOrder["status"]>("all");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/business/supplier-orders", { headers: { "x-company-id": companyId }, cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message ?? "Orders could not be loaded.");
      setOrders(body.data.items); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Orders could not be loaded."); }
  }, [companyId]);
  useEffect(() => { void load(); }, [load, reloadToken]);
  // The business WhatsApp number is needed to send an order again.
  useEffect(() => {
    let active = true;
    fetch("/api/business/company-contact", { headers: { "x-company-id": companyId }, cache: "no-store" }).then(r => r.ok ? r.json() : null).then(b => { if (active) setCompanyPhone(b?.data?.phone ?? null); }).catch(() => undefined);
    return () => { active = false; };
  }, [companyId]);

  async function setStatus(order: SupplierOrder, status: SupplierOrder["status"]) {
    try {
      const session = await fetch("/api/auth/session", { cache: "no-store" });
      if (!session.ok) throw new Error("Please sign in again.");
      const csrf = (await session.json()).csrfToken;
      const response = await fetch(`/api/business/supplier-orders/${order.id}`, { method: "PATCH", headers: { "x-company-id": companyId, "x-csrf-token": csrf, "idempotency-key": crypto.randomUUID(), "content-type": "application/json" }, body: JSON.stringify({ status }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message ?? "The order could not be updated.");
      setOrders(current => (current ?? []).map(o => o.id === body.data.id ? body.data : o));
      setNotice(`${order.number} marked as ${status}.`);
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "The order could not be updated."); }
  }
  function resend(order: SupplierOrder) {
    window.open(`https://wa.me/${whatsappNumber(companyPhone)}?text=${encodeURIComponent(whatsappOrderMessage(order, companyName, order.number))}`, "_blank", "noopener,noreferrer");
  }

  const shown = (orders ?? []).filter(o => filter === "all" || o.status === filter);
  const waiting = (orders ?? []).filter(o => o.status === "sent").length;
  return <Card id="order-history" className="min-w-0 p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-xl font-bold">{title}</h2>
      <div className="flex flex-wrap items-center gap-3">
        {orders?.length ? <p className="text-xs text-muted">{waiting} waiting for delivery · {orders.length} order{orders.length === 1 ? "" : "s"} in total</p> : null}
        <select aria-label="Show orders" value={filter} onChange={e => setFilter(e.target.value as typeof filter)} className="field-control h-9 w-auto py-1 text-sm"><option value="all">All orders</option><option value="sent">Waiting for delivery</option><option value="delivered">Delivered</option><option value="cancelled">Cancelled</option></select>
      </div>
    </div>
    {notice ? <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-2 text-sm font-semibold text-emerald-800">{notice}</p> : null}
    {error ? <p role="alert" className="mt-3 text-sm text-red-800">{error} <button type="button" className="underline" onClick={() => void load()}>Retry</button></p>
      : orders === null ? <p className="mt-3 text-sm text-muted">Loading orders…</p>
      : !orders.length ? <p className="mt-3 text-sm text-muted">No orders yet. Add products on <Link href="/app/ors/prices" className="font-semibold text-brand-700 underline">Price Comparison</Link> and send the order on WhatsApp. It is saved here, so you can see what you ordered and mark it delivered.</p>
      : !shown.length ? <p className="mt-3 text-sm text-muted">No orders in this view.</p>
      : <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="text-left text-xs text-muted"><tr><th className="py-2">Order</th><th>Date</th><th>Supplier</th><th>Items</th><th>Total</th><th>Sent by</th><th>Status</th><th className="text-right">Actions</th></tr></thead>
        <tbody>{shown.map(o => <Fragment key={o.id}><tr className="border-t border-line align-middle">
          <td className="py-2 font-semibold"><button type="button" className="underline decoration-dotted" onClick={() => setOpen(open === o.id ? "" : o.id)} aria-expanded={open === o.id}>{o.number}</button></td>
          <td className="whitespace-nowrap text-muted">{new Date(o.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
          <td className="font-semibold">{o.supplierName}</td><td>{o.lines.length}</td><td className="font-semibold tabular-nums">{money(o.total, o.currency)}</td>
          <td>{o.channel === "whatsapp" ? "WhatsApp" : "Email (old)"}</td>
          <td><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${o.status === "delivered" ? "bg-emerald-100 text-emerald-800" : o.status === "cancelled" ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-800"}`}>{o.status === "sent" ? "Sent" : o.status === "delivered" ? "Delivered" : "Cancelled"}</span></td>
          <td className="whitespace-nowrap text-right">
            {o.status === "sent" ? <><Button type="button" variant="outline" className="min-h-8 px-2 text-xs" onClick={() => void setStatus(o, "delivered")}>Mark delivered</Button>{" "}
              <Button type="button" variant="outline" className="min-h-8 px-2 text-xs" onClick={() => resend(o)}>Send again</Button>{" "}
              <button type="button" className="px-1 text-xs text-red-700 underline" onClick={() => { if (window.confirm(`Cancel order ${o.number}?`)) void setStatus(o, "cancelled"); }}>Cancel</button></>
              : <button type="button" className="text-xs text-muted underline" onClick={() => void setStatus(o, "sent")}>Undo</button>}
          </td></tr>
          {open === o.id ? <tr className="bg-wash"><td colSpan={8} className="p-3"><ul className="grid gap-1 text-sm">{o.lines.map((line, i) => <li key={i} className="flex justify-between gap-3"><span>{line.quantity} x {line.name}</span><span className="tabular-nums">{money(line.unitPrice, o.currency)} each · {money(line.unitPrice * line.quantity, o.currency)}</span></li>)}</ul></td></tr> : null}
        </Fragment>)}</tbody></table></div>}
  </Card>;
}
