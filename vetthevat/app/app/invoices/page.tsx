"use client";
import Link from "next/link";
import { Download, FileUp, Plus, Search, SlidersHorizontal, Trash2, FileSpreadsheet } from "lucide-react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAppState } from "@/components/app-state";
import { PageHeader, StatusBadge } from "@/components/workspace-kit";
import { FinancialTable, type FinancialColumn } from "@/components/ui/financial-table";
import { SelectField, TextField } from "@/components/ui/field";
import { Feedback } from "@/components/ui/feedback";
import { filterInvoices } from "@/lib/invoice-filters";
import type { Invoice } from "@/lib/domain";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/toast-provider";
import { cn, formatCurrency } from "@/lib/utils";

export default function InvoicesPage() { return <Suspense fallback={<Feedback kind="loading" title="Loading invoice search" />}><InvoiceList /></Suspense>; }
function InvoiceList() {
  const searchParams = useSearchParams(), urlQuery = searchParams.get("query") ?? "";
  const { invoices, documents, selectedCompany, services, companies, setSelectedCompanyId, deleteInvoice, storageReady } = useAppState();
  const { showToast } = useToast();
  const [query,setQuery] = useState(""), [status,setStatus] = useState("All"), [dateFrom,setDateFrom] = useState(""), [dateTo,setDateTo] = useState(""), [currency,setCurrency] = useState("All"), [sort,setSort] = useState("date-desc"), [direction,setDirection]=useState("All");
  useEffect(() => { setQuery(urlQuery); }, [urlQuery]);
  const filtered = useMemo(() => filterInvoices(invoices,{companyId:selectedCompany.id,query,status,dateFrom,dateTo,currency,transactionType:direction},documents).sort((a,b)=>sort==="number"?a.invoiceNumber.localeCompare(b.invoiceNumber):sort==="date-asc"?a.invoiceDate.localeCompare(b.invoiceDate):b.invoiceDate.localeCompare(a.invoiceDate)),[invoices,documents,selectedCompany.id,query,status,dateFrom,dateTo,currency,sort,direction]);
  const scoped = invoices.filter((invoice)=>invoice.companyId===selectedCompany.id);
  const dateError = Boolean(dateFrom && dateTo && dateFrom > dateTo);
  const columns: FinancialColumn<Invoice>[] = [
    {key:"number",label:"Invoice",value:(row)=>row.invoiceNumber,render:(row)=><Link className="font-semibold text-brand-700" href={`/app/invoices/${row.id}`}>{row.invoiceNumber || "Untitled draft"}</Link>},
    {key:"supplier",label:"Counterparty",value:(row)=>row.transactionType==="Sale"?row.customerName:row.supplierName,render:(row)=><span className="block max-w-[230px] truncate" title={row.supplierName}>{(row.transactionType==="Sale"?row.customerName:row.supplierName) || "Unassigned counterparty"}</span>},
    {key:"date",label:"Invoice date",value:(row)=>row.invoiceDate,render:(row)=><span className="whitespace-nowrap text-muted">{row.invoiceDate || "Not supplied"}</span>},
    {key:"net",label:"Net",numeric:true,optional:true,value:(row)=>row.subtotal,render:(row)=>formatCurrency(row.subtotal,row.currency)},
    {key:"vat",label:"VAT",numeric:true,optional:true,value:(row)=>row.vatAmount,render:(row)=>formatCurrency(row.vatAmount,row.currency)},
    {key:"gross",label:"Gross",numeric:true,value:(row)=>row.totalAmount,render:(row)=><span className="font-semibold">{formatCurrency(row.totalAmount,row.currency)}</span>},
    {key:"status",label:"Status",render:(row)=><StatusBadge status={row.status}/>},
    {key:"original",label:"Source",optional:true,render:(row)=><span className="text-xs text-muted">{documents.find((item)=>item.id===row.documentId)?.fileName || (row.documentId?"Missing metadata":"Manual entry")}</span>},
    {key:"actions",label:"Action",render:(row)=>(
      <button
        type="button"
        title="Delete invoice"
        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          if (window.confirm(`Delete invoice ${row.invoiceNumber || "draft"}? This cannot be undone.`)) {
            deleteInvoice(row.id);
            showToast({ title: "Invoice deleted", tone: "success" });
          }
        }}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    )}
  ];
  if(!storageReady)return <Feedback kind="loading" title="Loading local invoices" />;
  return <>
    <PageHeader title="Invoices" description="Capture and review purchase and sales invoices. Records are saved in this browser only." action={<div className="flex flex-wrap gap-2"><ButtonLink variant="outline" href="/app/invoices/new"><Plus className="h-4 w-4"/>Add Invoice</ButtonLink><ButtonLink variant="outline" href="/app/invoices/upload?tab=excel"><FileSpreadsheet className="h-4 w-4"/>Import Excel</ButtonLink><ButtonLink href="/app/invoices/upload"><FileUp className="h-4 w-4"/>Upload Supplier Invoice</ButtonLink></div>}/>
    <div className="mb-5 flex gap-1 overflow-x-auto border-b border-line" role="group" aria-label="Invoice views">{["All","Pending Review","Draft","Reviewed"].map((value)=><button key={value} type="button" aria-pressed={status===value} onClick={()=>setStatus(value)} className={cn("flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold",status===value?"border-brand-500 text-brand-700":"border-transparent text-muted hover:text-ink")}>{value==="All"?"All invoices":value}<span className="rounded bg-white px-1.5 py-0.5 text-[10px] tabular-nums">{value==="All"?scoped.length:scoped.filter((row)=>row.status===value).length}</span></button>)}</div>
    <label className="mb-4 grid max-w-xs gap-2 text-sm font-semibold">Invoice direction<select aria-label="Invoice direction filter" className="field-control" value={direction} onChange={event=>setDirection(event.target.value)}>{["All","Purchase","Sale","Unclassified"].map(value=><option key={value}>{value}</option>)}</select></label>
    <Card className="mb-5 p-4"><div className="flex flex-col gap-4 lg:flex-row lg:items-end"><div className="min-w-0 flex-1"><TextField label="Search invoices" aria-label="Search invoices" placeholder="Search supplier, invoice number or document" value={query} onChange={(event)=>setQuery(event.target.value)}/></div><div className="grid gap-3 sm:grid-cols-2 lg:w-[370px]"><SelectField label="Status" aria-label="Invoice status" value={status} onChange={(event)=>setStatus(event.target.value)}>{["All","Draft","Reviewed","Pending Review","Processed","Duplicate Warning","Processing Failed"].map((value)=><option key={value}>{value}</option>)}</SelectField><SelectField label="Sort by" aria-label="Sort invoices" value={sort} onChange={(event)=>setSort(event.target.value)}><option value="date-desc">Newest invoice date</option><option value="date-asc">Oldest invoice date</option><option value="number">Invoice number</option></SelectField></div></div><details className="mt-4 border-t border-line pt-3"><summary className="inline-flex cursor-pointer items-center gap-2 py-2 text-xs font-semibold text-muted"><SlidersHorizontal className="h-3.5 w-3.5"/>Company, dates and currency</summary><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><SelectField label="Company" aria-label="Company filter" value={selectedCompany.id} onChange={(event)=>{try{setSelectedCompanyId(event.target.value);}catch(reason){showToast({title:"Company selection failed",description:reason instanceof Error?reason.message:"Try again."});}}}>{companies.map((company)=><option key={company.id} value={company.id}>{company.name}</option>)}</SelectField><TextField label="From date" type="date" value={dateFrom} onChange={(event)=>setDateFrom(event.target.value)} error={dateError?"Choose a date on or before the end date.":undefined}/><TextField label="To date" type="date" value={dateTo} onChange={(event)=>setDateTo(event.target.value)}/><SelectField label="Currency" aria-label="Currency filter" value={currency} onChange={(event)=>setCurrency(event.target.value)}>{["All","GBP","EUR","USD"].map((value)=><option key={value}>{value}</option>)}</SelectField></div></details>{dateError?<div className="mt-4"><Feedback kind="error" title="From date must be on or before to date."/></div>:null}</Card>
    <Card className="overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4"><div><h2 className="text-sm font-semibold">Invoice register</h2><p className="mt-1 text-xs text-muted">{selectedCompany.name} · {filtered.length} matching records</p></div><Button variant="outline" className="min-h-9 px-3 text-xs" disabled={!filtered.some((row)=>row.processingStatus==="Confirmed"&&row.reviewStatus==="Reviewed")} onClick={()=>{try{services.reports.exportExcel(filtered,documents,selectedCompany);showToast({title:"Filtered workbook download requested",description:"Reviewed invoices matching these filters only.",tone:"success"});}catch(reason){showToast({title:"Export failed",description:reason instanceof Error?reason.message:"Your records have not changed."});}}}><Download className="h-3.5 w-3.5"/>Export Reviewed</Button></div>
    <FinancialTable key={JSON.stringify([selectedCompany.id,query,status,dateFrom,dateTo,currency,sort,direction])} rows={filtered} columns={columns} rowKey={(row)=>row.id} caption="Invoice register" empty={<Feedback title="No invoices found" action={<Button variant="outline" onClick={()=>{setQuery("");setStatus("All");setDateFrom("");setDateTo("");setCurrency("All");setDirection("All");}}>Clear filters</Button>}>Change your filters, upload a source document or enter an invoice manually.</Feedback>} mobile={(row)=><Link href={`/app/invoices/${row.id}`} className="block"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold text-brand-700">{row.invoiceNumber||"Untitled draft"}</p><p className="mt-1 truncate text-sm">{(row.transactionType==="Sale"?row.customerName:row.supplierName)||"Unassigned counterparty"}</p></div><span className="shrink-0 font-semibold tabular-nums">{formatCurrency(row.totalAmount,row.currency)}</span></div><div className="mt-3 flex items-center justify-between gap-2"><span className="text-xs text-muted">{row.invoiceDate||"No date"}</span><StatusBadge status={row.status}/></div></Link>}/></Card>
  </>;
}

