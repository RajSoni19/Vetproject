"use client";
// Registered office address and Companies House number for one company.
// Entered at company setup; viewable and editable here.
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { normalizeCompanyNumber } from "@/lib/supplier-orders";

type Details = { companyNumber: string | null; registeredAddress: string | null };

export function CompanyRegistrationCard({ companyId }: { companyId: string }) {
  const [details, setDetails] = useState<Details | null>(null), [editing, setEditing] = useState(false), [busy, setBusy] = useState(false);
  const [number, setNumber] = useState(""), [address, setAddress] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/business/company-contact", { headers: { "x-company-id": companyId }, cache: "no-store", credentials: "same-origin" })
      .then(r => r.ok ? r.json() : null).then(body => { if (active && body?.data) setDetails({ companyNumber: body.data.companyNumber ?? null, registeredAddress: body.data.registeredAddress ?? null }); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [companyId]);

  function edit() { setNumber(details?.companyNumber ?? ""); setAddress(details?.registeredAddress ?? ""); setError(""); setNotice(""); setEditing(true); }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const companyNumber = normalizeCompanyNumber(number);
    if (companyNumber === false) { setError("Enter the 8-character company number from Companies House, for example 13600353."); return; }
    setBusy(true); setError("");
    try {
      const session = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
      if (!session.ok) throw Error("Please sign in again.");
      const { csrfToken } = await session.json();
      const response = await fetch("/api/business/company-contact", { method: "PUT", credentials: "same-origin", headers: { "content-type": "application/json", "x-csrf-token": csrfToken, "x-company-id": companyId }, body: JSON.stringify({ companyNumber, registeredAddress: address }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw Error(body?.error?.message ?? "The company details could not be saved.");
      setDetails({ companyNumber: body.data.companyNumber ?? null, registeredAddress: body.data.registeredAddress ?? null });
      setEditing(false); setNotice("Company details saved.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The company details could not be saved."); }
    finally { setBusy(false); }
  }

  return <Card className="grid gap-4 p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-bold">Company details</h2>
      {!editing ? <Button type="button" variant="outline" onClick={edit}>Edit</Button> : null}
    </div>
    {error ? <p role="alert" className="text-sm text-red-800">{error}</p> : null}
    {notice ? <p role="status" className="text-sm text-brand-700">{notice}</p> : null}
    {editing ? <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
      <label className="grid gap-2 text-sm font-semibold">Company number<input className="field-control uppercase" maxLength={12} value={number} disabled={busy} placeholder="13600353" onChange={e => setNumber(e.target.value)} /><span className="text-xs font-normal text-muted">Leave blank if you are not a limited company.</span></label>
      <label className="grid gap-2 text-sm font-semibold sm:col-span-2">Registered office address<textarea className="field-control min-h-[4.5rem] py-2" rows={2} maxLength={500} value={address} disabled={busy} onChange={e => setAddress(e.target.value)} /></label>
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button></div>
    </form> : <dl className="grid gap-4 sm:grid-cols-2">
      <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted">Company number</dt><dd className="mt-1 font-semibold">{details?.companyNumber ?? <span className="font-normal text-muted">Not added</span>}</dd></div>
      <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted">Registered office address</dt><dd className="mt-1 font-semibold">{details?.registeredAddress ?? <span className="font-normal text-muted">Not added</span>}</dd></div>
    </dl>}
  </Card>;
}
