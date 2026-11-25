"use client";
import {ukDate} from "@/lib/uk-date";
import { useEffect, useState } from "react";
import { leadServices, leadStatuses } from "@/lib/leads/contracts";
import type { StoredLead } from "@/lib/server/leads/core";
export function AdminLeads({ csrfToken }: { csrfToken: string }) {
  const [rows, setRows] = useState<StoredLead[]>([]), [query, setQuery] = useState(""), [service, setService] = useState(""), [status, setStatus] = useState(""), [cursor, setCursor] = useState<string | null>(null), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  async function load(next: string | null = null) {
    setBusy(true); setMessage("");
    try { const params = new URLSearchParams(); if (query) params.set("query", query); if (service) params.set("service", service); if (status) params.set("status", status); if (next) params.set("cursor", next);
      const response = await fetch(`/api/admin/leads?${params}`, { cache: "no-store" }); const body = await response.json(); if (!response.ok) throw new Error(body.error?.message ?? "Leads are unavailable."); setRows(body.items); setCursor(body.nextCursor);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Leads are unavailable."); } finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  async function update(event: React.FormEvent<HTMLFormElement>, lead: StoredLead) {
    event.preventDefault(); if (!csrfToken) return; const form = new FormData(event.currentTarget); setBusy(true);
    try { const response = await fetch("/api/admin/leads", { method: "PATCH", headers: { "content-type": "application/json", "x-csrf-token": csrfToken }, body: JSON.stringify({ id: lead.id, status: form.get("status"), notes: form.get("notes"), version: lead.version }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error?.message ?? "Update unavailable."); setRows(current => current.map(row => row.id === lead.id ? result.lead : row)); setMessage("Lead updated."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Update unavailable."); } finally { setBusy(false); }
  }
  const field = "h-10 w-full rounded-lg border border-line bg-white px-3 text-xs sm:text-sm";
  return (
    <section className="space-y-5">
      <h1 className="text-xl sm:text-2xl font-bold">Lead enquiries</h1>
      <form
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end rounded-xl border border-line bg-white p-4"
        onSubmit={event => { event.preventDefault(); void load(); }}
      >
        <label className="grid gap-1 text-xs font-semibold text-slate-600">
          Search
          <input
            className={field}
            placeholder="Name or company…"
            value={query}
            maxLength={200}
            onChange={event => setQuery(event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-600">
          Service
          <select className={field} value={service} onChange={event => setService(event.target.value)}>
            <option value="">All services</option>
            {leadServices.map(value => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-600">
          Status
          <select className={field} value={status} onChange={event => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            {leadStatuses.map(value => <option key={value}>{value}</option>)}
          </select>
        </label>
        <button disabled={busy} className="h-10 rounded-lg bg-emerald-800 px-4 text-xs sm:text-sm font-semibold text-white hover:bg-emerald-900 transition">
          {busy ? "Searching…" : "Search leads"}
        </button>
      </form>
      <p role="status" className="text-xs sm:text-sm text-slate-600">
        {message || (busy ? "Loading…" : rows.length ? "" : "No lead enquiries found.")}
      </p>
      <div className="grid gap-4">
        {rows.map(lead => (
          <article key={`${lead.id}:${lead.version}`} className="rounded-xl border border-line bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold text-sm sm:text-base">{lead.fullName} · {lead.businessName}</h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 capitalize">{lead.status}</span>
            </div>
            <p className="mt-2 break-all text-xs sm:text-sm text-slate-600">{lead.email} · {lead.phone}</p>
            <p className="mt-1 text-xs text-slate-500">{lead.service} · Submitted {ukDate(lead.createdAt)} · {lead.id}</p>
            {lead.requirements ? (
              <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs sm:text-sm text-slate-800 border border-slate-100">
                {lead.requirements}
              </p>
            ) : null}
            <form className="mt-4 grid gap-3 sm:grid-cols-2 items-end pt-3 border-t border-line" onSubmit={event => void update(event, lead)}>
              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                Update status
                <select name="status" defaultValue={lead.status} className={field}>
                  {leadStatuses.map(value => <option key={value}>{value}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-600 sm:col-span-2">
                Notes
                <textarea name="notes" defaultValue={lead.notes} maxLength={2000} rows={2} className="w-full rounded-lg border border-line p-3 text-xs sm:text-sm" />
              </label>
              <button className="h-10 rounded-lg bg-slate-900 px-4 text-xs sm:text-sm font-semibold text-white hover:bg-slate-800 transition justify-self-start" disabled={busy || !csrfToken}>
                Save lead
              </button>
            </form>
          </article>
        ))}
      </div>
      {cursor && (
        <button className="h-10 rounded-lg border border-line bg-white px-4 text-xs sm:text-sm font-semibold hover:bg-slate-50" disabled={busy} onClick={() => void load(cursor)}>
          Next page
        </button>
      )}
    </section>
  );
}
