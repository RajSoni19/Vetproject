"use client";

import {ukDate} from "@/lib/uk-date";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Download, FileText, Pencil, ShieldCheck, Trash2 } from "lucide-react";
import { DocumentViewer } from "@/components/document-viewer";
import { useAppState } from "@/components/app-state";
import { PageHeader, StatusBadge } from "@/components/workspace-kit";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { InvoiceEditor } from "@/components/invoice-editor";
import { ButtonLink } from "@/components/ui/button";
import { InvoiceWorkbench } from "@/components/invoice-workbench";
import { useToast } from "@/components/toast-provider";

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { invoices, documents, selectedCompany, services, deleteInvoice, storageReady } = useAppState();
  const [editing, setEditing] = useState(false);
  const { showToast } = useToast();
  const invoice = invoices.find((item) => item.id === params.id && item.companyId === selectedCompany.id);
  if (!storageReady) return <p role="status">Loading local workspace…</p>;
  if (!invoice) return <><PageHeader title="Invoice not found" description="This invoice is not available in the selected company." /><ButtonLink href="/app/invoices">Back to invoices</ButtonLink></>;
  const document = documents.find((item) => item.id === invoice.documentId);
  const money = (value: number) => formatCurrency(value, invoice.currency);
  if (editing) return <><PageHeader title={`Edit ${invoice.invoiceNumber || "draft invoice"}`} description="Edits are saved in this browser profile. Confirmed records must be reviewed again after editing." /><InvoiceWorkbench document={document}><InvoiceEditor key={invoice.id} initialInvoice={invoice} showPayment={Boolean(invoice.paymentStatus)} onCancel={() => setEditing(false)} onSaved={() => setEditing(false)} /></InvoiceWorkbench></>;

  const handleDelete = () => {
    if (window.confirm(`Are you sure you want to delete invoice ${invoice.invoiceNumber || "draft"}? This cannot be undone.`)) {
      deleteInvoice(invoice.id);
      showToast({ title: "Invoice deleted", tone: "success" });
      router.push("/app/invoices");
    }
  };

  return (
    <>
      <PageHeader title={invoice.invoiceNumber || "Draft invoice"} description={`${invoice.supplierName} - local invoice record; original availability depends on the upload session.`} action={<StatusBadge status={invoice.status} />} />
      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="grid gap-6">
          <DocumentViewer document={document} />
          <Card className="p-5">
            <h2 className="text-xl font-bold">Actions</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Button variant="outline" onClick={() => { try { services.reports.exportPdf([invoice], selectedCompany); } catch(reason) { showToast({title:"Export failed",description:reason instanceof Error ? reason.message : "Try again."}); } }}><FileText className="h-4 w-4" />Download PDF</Button>
              <Button variant="outline" onClick={() => { try { services.reports.exportExcel([invoice], documents, selectedCompany, {approval:"All"}); } catch(reason) { showToast({title:"Export failed",description:reason instanceof Error ? reason.message : "Try again."}); } }}><Download className="h-4 w-4" />Export Excel</Button>
              <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" />Edit</Button>
              <Button onClick={() => setEditing(true)}><ShieldCheck className="h-4 w-4" />Review & Confirm</Button>
              <Button variant="outline" className="text-red-600 hover:bg-red-50 hover:text-red-700 sm:col-span-2" onClick={handleDelete}><Trash2 className="h-4 w-4 mr-1.5" />Delete Invoice</Button>
            </div>
          </Card>
        </div>
        <div className="grid gap-6">
          {invoice.warnings.length ? <Card className="border-red-200 bg-red-50 p-5">{invoice.warnings.map((warning) => <p key={warning.id} className="text-sm font-semibold text-red-800">{warning.title}: {warning.description}</p>)}</Card> : null}
          <Card className="p-6">
            <h2 className="text-xl font-bold">Invoice details</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Info label={invoice.transactionType==="Sale"?"Invoice issuer":"Supplier"} value={invoice.supplierName} name />
              <Info label={invoice.transactionType==="Sale"?"Issuer VAT number":"Supplier VAT number"} value={invoice.supplierVatNumber} />
              <Info label="Recorded direction" value={invoice.transactionType||"Unclassified"}/>
              <Info label="Invoice date" value={ukDate(invoice.invoiceDate)} />
              <Info label="Due date" value={ukDate(invoice.dueDate)} />
              <Info label="Customer" value={invoice.customerName} name />
              <Info label="Customer VAT number" value={invoice.customerVatNumber} />
            </div>
          </Card>
          <Card className="overflow-hidden">
            <div className="border-b border-line p-5"><h2 className="text-xl font-bold">Line items</h2></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-wash text-muted"><tr>{["Description", "Qty", "Unit", "VAT", "Net", "VAT amount", "Gross"].map((item) => <th key={item} className="px-5 py-3">{item}</th>)}</tr></thead><tbody>{invoice.lineItems.map((line) => <tr key={line.id} className="border-t border-line"><td className="px-5 py-4 font-semibold">{line.description}</td><td className="px-5 py-4">{line.quantity}</td><td className="px-5 py-4">{money(line.unitPrice)}</td><td className="px-5 py-4">{line.vatRate}%</td><td className="px-5 py-4">{money(line.netAmount)}</td><td className="px-5 py-4">{money(line.vatAmount)}</td><td className="px-5 py-4 font-semibold">{money(line.grossAmount)}</td></tr>)}</tbody></table></div>
          </Card>
          <Card className="p-5">
            <h2 className="text-xl font-bold">Totals and audit</h2>
            <div className="mt-4 grid gap-3 text-sm">
              <Row label="Net amount" value={money(invoice.subtotal)} />
              <Row label="VAT amount" value={money(invoice.vatAmount)} />
              <Row label="Gross total" value={money(invoice.totalAmount)} strong />
              <Row label="Created" value={ukDate(invoice.createdAt)} />
              <Row label="Last modified" value={ukDate(invoice.updatedAt)} />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function Info({ label, value, name = false }: { label: string; value: string; name?: boolean }) {
  return <div><p className="text-xs font-bold uppercase tracking-wide text-muted">{label}</p><p className="mt-1 font-semibold" {...(name && value ? { translate: "no" as const, "data-vtv-name": "" } : {})}>{value || "Not supplied"}</p></div>;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className="flex justify-between border-b border-line pb-3"><span className="text-muted">{label}</span><span className={strong ? "text-xl font-bold" : "font-semibold"}>{value}</span></div>;
}
