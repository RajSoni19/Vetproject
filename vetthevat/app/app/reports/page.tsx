"use client";
import Link from "next/link";
import { useState } from "react";
import { Download } from "lucide-react";
import { useAppState } from "@/components/app-state";
import { PageHeader, StatusBadge } from "@/components/workspace-kit";
import { ReportControls, CurrencyMetrics, RecordTrends, useLocalReport } from "@/components/reporting-kit";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FinancialTable } from "@/components/ui/financial-table";
import { Feedback } from "@/components/ui/feedback";
import { formatCurrency } from "@/lib/utils";

export default function ReportsPage() {
  const { invoices, documents, selectedCompany, services, storageReady, addAuditEvent } = useAppState();
  const { report, error, filters, setFilters } = useLocalReport("Reviewed");
  const [type, setType] = useState("VAT summary");
  const [feedback, setFeedback] = useState("");
  const [exportError,setExportError]=useState("");
  function exportReport(format: "Excel" | "PDF") {
    try {
      setExportError("");
      if (format === "Excel") services.reports.exportExcel(invoices, documents, selectedCompany, filters);
      else services.reports.exportPdf(invoices, selectedCompany, filters, documents);
      setFeedback(format + " download requested for " + report.rows.length + " filtered invoices. Browser download settings may apply.");
      try { addAuditEvent({ id: crypto.randomUUID(), user: "Local workspace user", action: format + " export requested", entity: selectedCompany.name, details: report.period + "; " + report.rows.length + " invoices", createdAt: new Date().toISOString() }); }
      catch { setFeedback(format + " download requested, but its local audit entry could not be saved."); }
    } catch (reason) { setFeedback("");setExportError(reason instanceof Error ? reason.message : "Export failed."); }
  }
  if (!storageReady) return <Feedback kind="loading" title="Loading local reports"/>;
  return <>
    <PageHeader title="Reports" description="Filter local records; the on-screen selection and exported records use the same rules. Currency totals are kept separate." />
    <ReportControls filters={filters} onChange={(next) => { setFilters(next); setFeedback("");setExportError(""); }} />
    {error ? <p role="alert" className="mb-4 text-sm text-red-700">{error}</p> : null}
    <CurrencyMetrics report={report} />
    <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_0.8fr]">
      <Card className="min-w-0 p-5"><label className="grid gap-2 text-sm font-semibold">Report type<select aria-label="Report type" value={type} onChange={(event) => setType(event.target.value)} className="h-10 rounded-md border border-line px-3">{["VAT summary", "Invoice summary", "Supplier activity"].map((item) => <option key={item}>{item}</option>)}</select></label><h2 className="mt-5 text-xl font-bold">{type}</h2>
        {type === "VAT summary" ? <RecordTrends report={report} /> : type === "Supplier activity" ? <div className="mt-4 grid gap-3">{report.suppliers.map((supplier) => <div key={supplier.supplierKey + supplier.currency} className="rounded-md border border-line p-3 text-sm"><p className="font-bold">{supplier.name} · {supplier.currency}</p><p>{supplier.count} invoices · Net {formatCurrency(supplier.net, supplier.currency)} · VAT {formatCurrency(supplier.vat, supplier.currency)} · Gross {formatCurrency(supplier.gross, supplier.currency)}</p></div>)}{!report.suppliers.length ? <p className="text-sm text-muted">No supplier records match.</p> : null}</div> : <div className="mt-4 flex flex-wrap gap-3">{report.statuses.map((status) => <div key={status.status} className="rounded-md border border-line p-3"><StatusBadge status={status.status} /><p className="mt-2 text-sm">{status.count} invoices</p></div>)}{!report.statuses.length ? <p className="text-sm text-muted">No invoice records match.</p> : null}</div>}
      </Card>
      <Card className="p-5"><h2 className="text-xl font-bold">Export</h2><p className="mt-2 text-sm text-muted">{report.rows.length} matching invoices · {report.period}. Both files include all matching invoices, not just the displayed page, including drafts when selected. Original-file availability is session-only.</p><div className="mt-5 grid gap-3"><Button variant="outline" disabled={Boolean(error) || !report.rows.length} onClick={() => exportReport("Excel")}><Download className="h-4 w-4" />Export Excel</Button><Button variant="outline" disabled={Boolean(error) || !report.rows.length} onClick={() => exportReport("PDF")}><Download className="h-4 w-4" />Download PDF</Button></div>{exportError?<p role="alert" className="mt-4 text-sm text-red-700">{exportError}</p>:null}{feedback ? <p role="status" className="mt-4 text-sm">{feedback}</p> : null}</Card>
    </div>
    <Card className="mt-6 overflow-hidden"><div className="border-b border-line p-5"><h2 className="text-xl font-bold">Filtered invoice records</h2></div>
      <FinancialTable key={JSON.stringify([selectedCompany.id,filters])} rows={report.rows} caption="Filtered report invoices" rowKey={invoice=>invoice.id} columns={[
        {key:"number",label:"Invoice",value:invoice=>invoice.invoiceNumber,render:invoice=><Link className="font-semibold text-brand-700" href={`/app/invoices/${invoice.id}`}>{invoice.invoiceNumber||"Untitled draft"}</Link>},
        {key:"supplier",label:"Recorded supplier",value:invoice=>invoice.supplierName,render:invoice=><span className="block max-w-[220px] break-words">{invoice.supplierName||"Unassigned"}</span>},
        {key:"date",label:"Date",value:invoice=>invoice.invoiceDate,render:invoice=>invoice.invoiceDate||"No date"},
        {key:"currency",label:"Currency",value:invoice=>invoice.currency,render:invoice=>invoice.currency},
        {key:"net",label:"Net",numeric:true,optional:true,render:invoice=>formatCurrency(invoice.subtotal,invoice.currency)},
        {key:"vat",label:"VAT",numeric:true,optional:true,render:invoice=>formatCurrency(invoice.vatAmount,invoice.currency)},
        {key:"gross",label:"Gross",numeric:true,render:invoice=><strong>{formatCurrency(invoice.totalAmount,invoice.currency)}</strong>},
        {key:"status",label:"Status",render:invoice=><StatusBadge status={invoice.status}/>},
        {key:"approval",label:"Approval",optional:true,render:invoice=>invoice.reviewStatus}
      ]} mobile={invoice=><Link href={`/app/invoices/${invoice.id}`} className="block min-w-0"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="break-words text-brand-700">{invoice.invoiceNumber||"Untitled draft"}</strong><StatusBadge status={invoice.status}/></div><p className="mt-2 break-words text-sm">{invoice.supplierName||"Unassigned"}</p><p className="mt-2 text-xs text-muted">{invoice.invoiceDate||"No date"} · {invoice.currency} · {invoice.reviewStatus}</p><dl className="mt-3 grid grid-cols-3 gap-2 text-xs">{[["Net",invoice.subtotal],["VAT",invoice.vatAmount],["Gross",invoice.totalAmount]].map(([label,value])=><div key={label}><dt className="text-muted">{label}</dt><dd className="mt-1 break-words font-semibold tabular-nums">{formatCurrency(Number(value),invoice.currency)}</dd></div>)}</dl></Link>}/>
    </Card>
  </>;
}

