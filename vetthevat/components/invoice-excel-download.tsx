"use client";
// "Download Excel" panel: confirmed invoices for a month, quarter, year or custom
// date range, optionally for one supplier. Used on the Invoices and Create Invoice pages.
import { useEffect, useState } from "react";
import { businessData, downloadBusiness } from "@/lib/browser-business";
import { Button } from "@/components/ui/button";
import { MONTH_NAMES, QUARTER_NAMES, periodRange, periodYears, type PeriodType } from "@/lib/report-periods";

type InvoiceRow = { state?: string; issued_on?: string };

export function InvoiceExcelDownload({ companyId, rows: givenRows }: { companyId: string; rows?: InvoiceRow[] }) {
  const today = new Date();
  const [periodType, setPeriodType] = useState<PeriodType>("month"), [year, setYear] = useState(today.getUTCFullYear()), [month, setMonth] = useState(today.getUTCMonth()), [quarter, setQuarter] = useState(Math.floor(today.getUTCMonth() / 3));
  const [customFrom, setCustomFrom] = useState(""), [customTo, setCustomTo] = useState("");
  const [loadedRows, setLoadedRows] = useState<InvoiceRow[]>([]), [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [supplierError, setSupplierError] = useState(""), [exportError, setExportError] = useState(""), [exporting, setExporting] = useState(false);
  const rows = givenRows ?? loadedRows;

  // Load the invoice list only when the page did not pass it in.
  useEffect(() => {
    if (givenRows) return;
    let active = true;
    void (async () => {
      let after: string | null = null; const all: InvoiceRow[] = [];
      do { const query = new URLSearchParams({ limit: "100" }); if (after) query.set("after", after); const result = await businessData(companyId, "invoices?" + query) as { items: InvoiceRow[]; after: string | null }; all.push(...result.items); after = result.after; } while (after);
      if (active) setLoadedRows(all);
    })().catch(() => undefined);
    return () => { active = false; };
  }, [companyId, givenRows]);

  useEffect(() => {
    let active = true;
    void (async () => {
      let after: string | null = null; const all: { id: string; name: string }[] = [];
      do { const query = new URLSearchParams({ kind: "supplier", limit: "100" }); if (after) query.set("after", after); const result = await businessData(companyId, "contacts?" + query) as { items: { id: string; name: string }[]; after: string | null }; all.push(...result.items); after = result.after; } while (after);
      if (active) setSuppliers(all);
    })().catch(e => { if (active) setSupplierError(e instanceof Error ? e.message : "Could not load suppliers for export filters."); });
    return () => { active = false; };
  }, [companyId]);

  // Excel includes confirmed invoices only, so the count shown matches what is downloaded.
  const range = periodType === "custom" ? (customFrom && customTo ? { startsOn: customFrom <= customTo ? customFrom : customTo, endsOn: customFrom <= customTo ? customTo : customFrom, label: `${customFrom}-to-${customTo}` } : null) : periodRange(periodType, year, periodType === "quarter" ? quarter : month);
  const confirmedInPeriod = range ? rows.filter(r => r.state === "confirmed" && String(r.issued_on).slice(0, 10) >= range.startsOn && String(r.issued_on).slice(0, 10) <= range.endsOn).length : 0;
  const years = periodYears(rows.map(r => r.issued_on));

  async function exportExcel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (exporting) return; setExporting(true); setExportError("");
    try {
      if (!range) throw Error("Choose the From and To dates.");
      const params = new URLSearchParams();
      for (const [key, value] of new FormData(event.currentTarget)) if (String(value)) params.set(key, String(value));
      params.set("startsOn", range.startsOn); params.set("endsOn", range.endsOn); params.set("format", "xlsx");
      await downloadBusiness(companyId, "invoice-report?" + params, `vetthevat-invoices-${range.label}.xlsx`);
    } catch (e) { setExportError(e instanceof Error ? e.message : "Excel export failed."); }
    finally { setExporting(false); }
  }

  return <section className="rounded-xl border border-line bg-white p-5"><h2 className="text-lg font-bold">Download Excel</h2><form onSubmit={exportExcel} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <label className="grid gap-1 text-sm font-semibold">Download by<select aria-label="Download by" className="field-control" value={periodType} disabled={exporting} onChange={e => setPeriodType(e.target.value as PeriodType)}><option value="month">Monthly</option><option value="quarter">Quarterly</option><option value="year">Yearly</option><option value="custom">Custom dates</option></select></label>
    {periodType === "month" ? <label className="grid gap-1 text-sm font-semibold">Month<select className="field-control" value={month} disabled={exporting} onChange={e => setMonth(Number(e.target.value))}>{MONTH_NAMES.map((name, index) => <option key={name} value={index}>{name}</option>)}</select></label> : null}
    {periodType === "quarter" ? <label className="grid gap-1 text-sm font-semibold">Quarter<select className="field-control" value={quarter} disabled={exporting} onChange={e => setQuarter(Number(e.target.value))}>{QUARTER_NAMES.map((name, index) => <option key={name} value={index}>{name}</option>)}</select></label> : null}
    {periodType === "custom"
      ? <><label className="grid gap-1 text-sm font-semibold">From<input type="date" required className="field-control" value={customFrom} disabled={exporting} onChange={e => setCustomFrom(e.target.value)} /></label><label className="grid gap-1 text-sm font-semibold">To<input type="date" required min={customFrom || undefined} className="field-control" value={customTo} disabled={exporting} onChange={e => setCustomTo(e.target.value)} /></label></>
      : <label className="grid gap-1 text-sm font-semibold">Year<select className="field-control" value={year} disabled={exporting} onChange={e => setYear(Number(e.target.value))}>{years.map(value => <option key={value} value={value}>{value}</option>)}</select></label>}
    <label className="grid gap-1 text-sm font-semibold">Supplier<select name="contactId" className="field-control" disabled={exporting || Boolean(supplierError)}><option value="">All suppliers</option>{suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
    <label className="grid gap-1 text-sm font-semibold">Currency<select name="currency" className="field-control" disabled={exporting}>{["GBP", "EUR", "USD"].map(value => <option key={value}>{value}</option>)}</select></label>
    <label className="grid gap-1 text-sm font-semibold">Payment status<select name="paymentStatus" className="field-control" disabled={exporting}><option value="">All statuses</option><option value="unpaid-due">Unpaid / due</option><option value="partially-paid">Partially paid</option><option value="fully-paid">Fully paid</option><option value="not-applicable">Not applicable</option></select></label>
    <label className="grid gap-1 text-sm font-semibold">VAT status<select name="vatStatus" className="field-control" disabled={exporting}><option value="">All VAT statuses</option><option value="review-required">Needs checking</option><option value="not-evidenced">No VAT shown</option><option value="evidenced">VAT shown on invoice</option><option value="eligible">VAT can be claimed</option><option value="ineligible">VAT can't be claimed</option></select></label>
    <div className="grid content-end gap-1"><Button type="submit" disabled={exporting || Boolean(supplierError) || !range || !confirmedInPeriod}>{exporting ? "Preparing…" : "Download Excel"}</Button></div>
  </form>
    {range ? <p role="status" className={`mt-3 text-sm ${confirmedInPeriod ? "text-muted" : "text-amber-800"}`}>{confirmedInPeriod ? `${confirmedInPeriod} confirmed invoice${confirmedInPeriod === 1 ? "" : "s"} in this period. Draft invoices are not included.` : "No confirmed invoices in this period. Choose another period, or confirm your draft invoices first."}</p> : null}
    {supplierError ? <p role="alert" className="mt-3 text-sm text-red-800">{supplierError}</p> : null}
    {exportError ? <p role="alert" className="mt-3 text-sm text-red-800">{exportError}</p> : null}
  </section>;
}
