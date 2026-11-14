"use client";
import { useEffect, useState } from "react";
import { useAppState } from "@/components/app-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { buildReport, type ReportFilters } from "@/lib/reporting";
import { useLocale } from "@/components/locale-provider";
import { formatCurrency } from "@/lib/i18n/catalog";
import type { MessageKey } from "@/lib/i18n/catalog";

const statusMessages:Record<string,MessageKey>={All:"reportStatusAll",Draft:"reportStatusDraft",Reviewed:"reportStatusReviewed","Pending Review":"reportStatusPendingReview",Processed:"reportStatusProcessed","Duplicate Warning":"reportStatusDuplicateWarning","Processing Failed":"reportStatusProcessingFailed","Needs Review":"reportApprovalNeedsReview"};

export function useLocalReport(approval: ReportFilters["approval"] = "All") {
  const { invoices, documents, selectedCompany } = useAppState();
  const [filters, setFilters] = useState<ReportFilters>({ approval, status: "All", currency: "All", supplierId: "", dateFrom: "", dateTo: "", query: "" });
  useEffect(() => { setFilters((current) => ({ ...current, supplierId: "" })); }, [selectedCompany.id]);
  let error = "";
  let report: ReturnType<typeof buildReport>;
  try { report = buildReport(invoices, documents, selectedCompany, filters); }
  catch (reason) { error = reason instanceof Error ? reason.message : "Report could not be prepared."; report = buildReport([], [], selectedCompany); }
  return { report, error, filters, setFilters };
}

export function ReportControls({ filters, onChange }: { filters: ReportFilters; onChange: (filters: ReportFilters) => void }) {
  const {t,locale}=useLocale();
  const { companies, selectedCompany, selectedCompanyId, setSelectedCompanyId, suppliers, storageReady, invoices } = useAppState();
  const [error, setError] = useState("");
  const field = "field-control";
  const change = (key: keyof ReportFilters, value: string) => onChange({ ...filters, [key]: value });
  return <Card className="mb-5 p-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <label className="grid gap-1 text-xs font-semibold">{t("reportCompany")}<select aria-label={t("reportCompanyAria")} disabled={!storageReady} className={field} value={selectedCompanyId} onChange={(event) => { try { setSelectedCompanyId(event.target.value); setError(""); } catch (reason) { setError(reason instanceof Error ? reason.message : t("reportCompanySelectionError")); } }}>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
    <label className="grid gap-1 text-xs font-semibold">{t("reportStartDate")}<input type="date" aria-label={t("reportStartDate")} className={field} value={filters.dateFrom ?? ""} onChange={(event) => change("dateFrom", event.target.value)} /></label>
    <label className="grid gap-1 text-xs font-semibold">{t("reportEndDate")}<input type="date" aria-label={t("reportEndDate")} className={field} value={filters.dateTo ?? ""} onChange={(event) => change("dateTo", event.target.value)} /></label>
    <label className="grid gap-1 text-xs font-semibold">{t("reportSupplier")}<select aria-label={t("reportSupplierAria")} className={field} value={filters.supplierId ?? ""} onChange={(event) => change("supplierId", event.target.value)}><option value="">{t("reportAllSuppliers")}</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
    <label className="grid gap-1 text-xs font-semibold">{t("reportInvoiceStatus")}<select aria-label={t("reportStatusAria")} className={field} value={filters.status ?? "All"} onChange={(event) => change("status", event.target.value)}>{["All", "Draft", "Reviewed", "Pending Review", "Processed", "Duplicate Warning", "Processing Failed"].map((status) => <option key={status} value={status}>{t(statusMessages[status])}</option>)}</select></label>
    <label className="grid gap-1 text-xs font-semibold">{t("reportApproval")}<select aria-label={t("reportApprovalAria")} className={field} value={filters.approval ?? "All"} onChange={(event) => change("approval", event.target.value)}>{["All", "Reviewed", "Needs Review"].map((status) => <option key={status} value={status}>{t(statusMessages[status])}</option>)}</select></label>
    <label className="grid gap-1 text-xs font-semibold">{t("reportCurrency")}<select aria-label={t("reportCurrencyAria")} className={field} value={filters.currency ?? "All"} onChange={(event) => change("currency", event.target.value)}>{["All", "GBP", "EUR", "USD"].map((currency) => <option key={currency} value={currency}>{currency==="All"?t("reportStatusAll"):currency}</option>)}</select></label>
    <label className="grid gap-1 text-xs font-semibold">{t("reportSearch")}<input aria-label={t("reportSearchAria")} className={field} placeholder={t("reportSearchPlaceholder")} value={filters.query ?? ""} onChange={(event) => change("query", event.target.value)} /></label>
    <label className="grid gap-1 text-xs font-semibold">{t("reportVatRate")}<select aria-label={t("reportVatRateAria")} className={field} value={filters.vatRate??"All"} onChange={event=>change("vatRate",event.target.value)}><option value="All">{t("reportStatusAll")}</option>{[...new Set(invoices.filter(row=>row.companyId===selectedCompany.id).flatMap(row=>row.vatBreakdown.map(vat=>vat.rate)))].sort((a,b)=>a-b).map(rate=><option key={rate} value={String(rate)}>{rate}%</option>)}</select></label>
  </div><p className="mt-3 text-xs text-muted">{t("reportHelp")}</p><Button className="mt-3" variant="ghost" onClick={() => onChange({ approval: filters.approval, currency: "All", status: "All", dateFrom: "", dateTo: "", supplierId: "", query: "",vatRate:"All" })}>{t("reportClearFilters")}</Button><Button variant="ghost" disabled={!selectedCompany.vatPeriodStart||!selectedCompany.vatPeriodEnd} onClick={()=>onChange({...filters,dateFrom:selectedCompany.vatPeriodStart,dateTo:selectedCompany.vatPeriodEnd})}>{t("reportUseCompanyVatPeriod")}</Button>{error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}</Card>;
}

export function CurrencyMetrics({ report }: { report: ReturnType<typeof buildReport> }) {
  const {t,locale}=useLocale();
  if (!report.rows.length) return <Card className="p-6 text-sm text-muted">{t("reportNoInvoices")}</Card>;
  return <div className="grid gap-4 md:grid-cols-2">{report.currencies.map((total) => <Card key={total.currency} className="p-5 sm:p-6" data-currency={total.currency}><div className="flex items-center justify-between"><p className="text-sm font-semibold">{total.currency}</p><span className="text-xs text-muted">{total.count} {t("reportInvoiceCount")}</span></div><div className="mt-5 grid gap-3 min-[400px]:grid-cols-3">{([ [t("reportNet"), total.net], [t("reportVat"), total.vat], [t("reportGross"), total.gross] ] as const).map(([label, amount]) => <div key={label}><p className="text-xs text-muted">{label}</p><p className="mt-1 break-words text-lg font-semibold tracking-tight tabular-nums" data-metric={label.toLowerCase()}>{formatCurrency(amount, total.currency,locale)}</p></div>)}</div></Card>)}</div>;
}

export function RecordTrends({ report }: { report: ReturnType<typeof buildReport> }) {
  const {t,locale}=useLocale();
  if (!report.monthly.length) return <p className="mt-4 text-sm text-muted">{t("reportNoDatedInvoices")}</p>;
  return <div className="mt-5 grid gap-5">{report.currencies.map(({ currency }) => {
    const rows = report.monthly.filter((row) => row.currency === currency);
    const largest = Math.max(1, ...rows.map((row) => row.gross));
    return <div key={currency}><p className="mb-3 text-sm font-semibold">{currency} {t("reportMonthlyTrend")}</p><div className="grid gap-3">{rows.map((row) => <div key={row.month} className="grid grid-cols-[70px_1fr] items-center gap-3 text-xs"><span>{row.month}</span><div><div aria-label={`${row.month} ${t("reportGross")} ${row.gross} ${currency}`} className="h-4 rounded bg-brand-500" style={{ width: `${Math.max(0, row.gross / largest * 100)}%` }} /><div aria-label={`${row.month} ${t("reportVat")} ${row.vat} ${currency}`} className="mt-1 h-2 rounded bg-brand-100" style={{ width: `${Math.max(0, row.vat / largest * 100)}%` }} /><p className="mt-1 text-muted">{t("reportGross")} {formatCurrency(row.gross, currency,locale)} · {t("reportVat")} {formatCurrency(row.vat, currency,locale)}</p></div></div>)}</div></div>;
  })}</div>;
}
