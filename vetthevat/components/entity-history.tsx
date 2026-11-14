"use client";
import Link from "next/link";
import type { Invoice, StoredDocument } from "@/lib/domain";
import { FinancialTable } from "@/components/ui/financial-table";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/workspace-kit";
import { formatCurrency } from "@/lib/utils";

export function InvoiceHistory({ invoices }: { invoices: Invoice[] }) {
  return <Card className="overflow-hidden"><h2 className="border-b border-line p-5 font-semibold">Invoice history</h2><FinancialTable rows={invoices} caption="Invoice history" rowKey={row=>row.id} columns={[
    {key:"invoice",label:"Invoice",value:row=>row.invoiceNumber,render:row=><Link className="font-semibold text-brand-700" href={`/app/invoices/${row.id}`}>{row.invoiceNumber||"Untitled draft"}</Link>},
    {key:"date",label:"Date",value:row=>row.invoiceDate,render:row=>row.invoiceDate||"Not supplied"},
    {key:"gross",label:"Gross",numeric:true,value:row=>row.totalAmount,render:row=>formatCurrency(row.totalAmount,row.currency)},
    {key:"status",label:"Status",render:row=><StatusBadge status={row.status}/>}
  ]} mobile={row=><Link href={`/app/invoices/${row.id}`}><div className="flex justify-between gap-3"><strong>{row.invoiceNumber||"Untitled draft"}</strong><span>{formatCurrency(row.totalAmount,row.currency)}</span></div><p className="my-2 text-xs text-muted">{row.invoiceDate||"No date"}</p><StatusBadge status={row.status}/></Link>}/></Card>;
}
export function DocumentFolder({ documents }: { documents: StoredDocument[] }) {
  return <Card className="p-5"><h2 className="font-semibold">Supplier document folder</h2><p className="mt-2 text-sm text-muted">Company-scoped metadata links. Original files are session-only; no durable folder storage is connected.</p><div className="mt-4 grid gap-3">{documents.map(document=><Link key={document.id} href={`/app/documents/${document.id}`} className="rounded-lg border border-line p-3"><p className="break-words font-medium">{document.fileName}</p><p className="mt-1 text-xs text-muted">{document.status} · {document.sizeLabel}</p></Link>)}{!documents.length?<p className="text-sm text-muted">No documents in this folder.</p>:null}</div></Card>;
}
