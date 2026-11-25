"use client";
import {ukDate} from "@/lib/uk-date";
import Link from "next/link";
import { ArrowRight, FileUp, Plus } from "lucide-react";
import { useAppState } from "@/components/app-state";
import { PageHeader, StatusBadge } from "@/components/workspace-kit";
import { ReportControls, CurrencyMetrics, RecordTrends, useLocalReport } from "@/components/reporting-kit";
import { FinancialTable } from "@/components/ui/financial-table";
import { Feedback } from "@/components/ui/feedback";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { DashboardPosition } from "@/components/dashboard-position";

export default function DashboardPage() {
  const { selectedCompany, invoices, suppliers, auditLog, storageReady } = useAppState();
  const { report, error, filters, setFilters } = useLocalReport();
  const recent = [...report.rows].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,5);
  const review = report.rows.filter((row)=>row.reviewStatus==="Needs Review");
  if(!storageReady)return <Feedback kind="loading" title="Loading local workspace"/>;
  return <>
    <PageHeader title="Dashboard" description={`${selectedCompany.name} · Your invoice workspace at a glance. Figures reflect your saved browser-local records.`} action={<div className="flex flex-wrap gap-2"><ButtonLink href="/app/invoices/new" variant="outline"><Plus className="h-4 w-4"/>Manual entry</ButtonLink><ButtonLink href="/app/invoices/upload"><FileUp className="h-4 w-4"/>Upload Supplier Invoice</ButtonLink></div>}/>
    <details className="mb-5 rounded-xl border border-line bg-white"><summary className="cursor-pointer px-5 py-4 text-xs font-semibold text-muted">Filter dashboard records</summary><div className="px-4 pb-1"><ReportControls filters={filters} onChange={setFilters}/></div></details>{error?<Feedback kind="error" title="Filters need checking">{error}</Feedback>:null}
    <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">{[["Total invoices",report.rows.length,"Matching current filters"],["Pending review",review.length,"Needs human verification"],["Reviewed",report.rows.filter((row)=>row.reviewStatus==="Reviewed"&&row.processingStatus==="Confirmed").length,"Confirmed local records"],["Suppliers",suppliers.length,"Across this company"]].map(([label,value,note])=><Card key={label} className="p-4 sm:p-5"><p className="text-xs font-medium text-muted">{label}</p><p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{value}</p><p className="mt-2 text-[11px] text-muted">{note}</p></Card>)}</div>
    <DashboardPosition rows={report.rows}/>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">Selected invoice totals</h2><span className="text-xs text-muted">All selected directions and statuses · currencies kept separate</span></div><CurrencyMetrics report={report}/>
    <div className="mt-6 grid items-start gap-5 xl:grid-cols-[1fr_340px]"><Card className="p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">Invoice activity</h2><p className="mt-1 text-xs text-muted">Gross invoice amounts and VAT by invoice month</p></div><Link href="/app/reports" className="text-xs font-semibold text-brand-700">Reports <ArrowRight className="inline h-3 w-3"/></Link></div><RecordTrends report={report}/></Card><Card className="p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">Review queue</h2><span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900">{review.length}</span></div><p className="mt-1 text-xs text-muted">Resolve missing fields before confirming.</p><div className="mt-4 grid gap-3">{review.slice(0,5).map((row)=><Link key={row.id} href={`/app/invoices/${row.id}`} className="rounded-lg border border-line p-3 transition hover:border-brand-500"><div className="flex justify-between gap-2"><p className="text-sm font-semibold">{row.invoiceNumber||"Untitled draft"}</p><ArrowRight className="h-4 w-4 shrink-0 text-muted"/></div><p className="mt-1 truncate text-xs text-muted">{row.supplierName||"Missing supplier"}</p><div className="mt-2"><StatusBadge status={row.status}/></div></Link>)}{!review.length?<Feedback title="No invoices need review">No matching records are waiting for review.</Feedback>:null}</div></Card></div>
    <Card className="mt-6 overflow-hidden"><div className="flex items-center justify-between gap-3 border-b border-line p-5"><div><h2 className="font-semibold">Recent invoices</h2><p className="mt-1 text-xs text-muted">Most recently updated matching records</p></div><Link href="/app/invoices" className="text-xs font-semibold text-brand-700">View all</Link></div><FinancialTable rows={recent} rowKey={(row)=>row.id} caption="Recent invoices" pageSize={5} columns={[
      {key:"number",label:"Invoice",render:(row)=><Link className="font-semibold text-brand-700" href={`/app/invoices/${row.id}`}>{row.invoiceNumber||"Untitled draft"}</Link>},
      {key:"supplier",label:"Recorded supplier",render:(row)=><span className="block max-w-[230px] truncate">{row.supplierName||"Unassigned"}</span>},
      {key:"date",label:"Date",optional:true,render:(row)=>row.invoiceDate||"No date"},
      {key:"vat",label:"VAT",numeric:true,render:(row)=>formatCurrency(row.vatAmount,row.currency)},
      {key:"total",label:"Gross",numeric:true,render:(row)=><strong>{formatCurrency(row.totalAmount,row.currency)}</strong>},
      {key:"status",label:"Status",render:(row)=><StatusBadge status={row.status}/>}
    ]} mobile={(row)=><Link href={`/app/invoices/${row.id}`} className="flex items-center justify-between gap-4"><div className="min-w-0"><p className="text-sm font-semibold text-brand-700">{row.invoiceNumber||"Untitled draft"}</p><p className="mt-1 truncate text-xs text-muted">{row.supplierName}</p></div><span className="shrink-0 text-sm font-semibold tabular-nums">{formatCurrency(row.totalAmount,row.currency)}</span></Link>}/></Card>
    <div className="mt-6 grid gap-5 md:grid-cols-2"><Card className="p-5"><h2 className="font-semibold">Recorded supplier references</h2><div className="mt-4 grid divide-y divide-line">{report.suppliers.map((supplier)=><div key={supplier.supplierKey+supplier.currency} className="flex justify-between gap-3 py-3 text-sm"><div className="min-w-0"><p className="truncate font-medium">{supplier.name}</p><p className="mt-1 text-xs text-muted">{supplier.count} invoices · {supplier.currency}</p></div><p className="shrink-0 font-semibold tabular-nums">{formatCurrency(supplier.gross,supplier.currency)}</p></div>)}{!report.suppliers.length?<Feedback title="No matching supplier activity"/>:null}</div></Card><Card className="p-5"><h2 className="font-semibold">Recent company activity</h2><div className="mt-4 grid gap-4">{auditLog.slice(0,5).map((event)=><div key={event.id} className="border-l-2 border-line pl-3"><p className="text-sm font-medium">{event.action}</p><p className="mt-1 text-xs text-muted">{event.entity} · {ukDate(event.createdAt)}</p></div>)}{!auditLog.length?<Feedback title="No local activity"/>:null}</div><p className="mt-4 text-[11px] leading-5 text-muted">Local activity is independent of invoice filters. {invoices.filter((row)=>row.companyId===selectedCompany.id).length} company records. This is not a secure server audit.</p></Card></div>
  </>;
}
