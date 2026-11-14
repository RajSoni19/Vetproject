"use client";

import { useState } from "react";
import Link from "next/link";
import { FileSearch, CheckCircle2, AlertCircle, FileUp, ArrowRight, Eye, ShieldCheck, RefreshCw, Trash2 } from "lucide-react";
import { useAppState } from "@/components/app-state";
import { Button } from "@/components/ui/button";
import { Card, Badge } from "@/components/ui/card";
import { InvoiceWorkbench } from "@/components/invoice-workbench";
import { InvoiceEditor } from "@/components/invoice-editor";
import { InvoiceReviewWorkflow } from "@/components/invoice-review-workflow";
import { formatCurrency } from "@/lib/utils";
import type { Invoice } from "@/lib/domain";

export function InvoiceOcrReviewPage() {
  const { invoices, documents, selectedCompany, selectedCompanyId, deleteInvoice } = useAppState();
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [filter, setFilter] = useState<"all" | "needs-review" | "reviewed">("needs-review");

  const selectedInvoice = invoices.find((inv) => inv.id === selectedInvoiceId);
  const selectedDoc = selectedInvoice ? documents.find((doc) => doc.id === selectedInvoice.documentId) : undefined;

  const reviewQueue = invoices.filter((inv) => {
    if (filter === "needs-review") return inv.reviewStatus === "Needs Review" || inv.status === "Pending Review" || inv.status === "Draft";
    if (filter === "reviewed") return inv.reviewStatus === "Reviewed" || inv.processingStatus === "Confirmed";
    return true;
  });

  if (showUpload) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <h2 className="text-xl font-bold">Upload &amp; Extract Document</h2>
          <Button variant="outline" className="min-h-9 px-3 text-xs" onClick={() => setShowUpload(false)}>
            Back to OCR Review Queue
          </Button>
        </div>
        <InvoiceReviewWorkflow />
      </div>
    );
  }

  if (selectedInvoice) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div>
            <h2 className="text-xl font-bold">Reviewing {selectedInvoice.invoiceNumber || "Invoice"}</h2>
            <p className="text-xs text-muted">Verify every line item and calculation against the source document.</p>
          </div>
          <Button variant="outline" className="min-h-9 px-3 text-xs" onClick={() => setSelectedInvoiceId(null)}>
            Close Review
          </Button>
        </div>
        <InvoiceWorkbench document={selectedDoc}>
          <InvoiceEditor
            initialInvoice={selectedInvoice}
            onCancel={() => setSelectedInvoiceId(null)}
            onSaved={() => setSelectedInvoiceId(null)}
          />
        </InvoiceWorkbench>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header card */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <FileSearch className="h-6 w-6 text-brand-700" />
              <h1 className="text-2xl font-bold">OCR &amp; Document Review</h1>
            </div>
            <p className="mt-1 text-sm text-muted">
              Inspect AI/OCR extractions, verify tax classifications, match multi-line products and approve for VAT and ORS.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setShowUpload(true)}>
              <FileUp className="mr-1.5 h-4 w-4" /> Upload New Invoice
            </Button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <button
            type="button"
            onClick={() => setFilter("needs-review")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
              filter === "needs-review" ? "bg-brand-700 text-white shadow-xs" : "bg-wash text-slate-700 hover:bg-slate-200"
            }`}
          >
            Needs Review ({invoices.filter((i) => i.reviewStatus === "Needs Review" || i.status === "Pending Review" || i.status === "Draft").length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("reviewed")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
              filter === "reviewed" ? "bg-brand-700 text-white shadow-xs" : "bg-wash text-slate-700 hover:bg-slate-200"
            }`}
          >
            Reviewed &amp; Confirmed ({invoices.filter((i) => i.reviewStatus === "Reviewed" || i.processingStatus === "Confirmed").length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
              filter === "all" ? "bg-brand-700 text-white shadow-xs" : "bg-wash text-slate-700 hover:bg-slate-200"
            }`}
          >
            All Invoices ({invoices.length})
          </button>
        </div>
      </Card>

      {/* Review Queue Table */}
      <Card className="p-0 overflow-hidden">
        <div className="border-b border-line bg-wash/50 px-6 py-4">
          <h2 className="text-base font-bold">
            {filter === "needs-review" ? "Invoices Awaiting Review" : filter === "reviewed" ? "Reviewed Invoices" : "All Documents"}
          </h2>
        </div>

        {reviewQueue.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-wash/30 text-xs font-semibold uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Invoice #</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Supplier</th>
                  <th className="px-6 py-3">Items</th>
                  <th className="px-6 py-3">Subtotal</th>
                  <th className="px-6 py-3">VAT</th>
                  <th className="px-6 py-3">Total</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {reviewQueue.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-6 py-4">
                      {inv.reviewStatus === "Reviewed" || inv.processingStatus === "Confirmed" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 className="h-4 w-4" /> Reviewed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                          <AlertCircle className="h-4 w-4" /> Needs Review
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-bold text-ink">
                      {inv.invoiceNumber || "Draft"}
                    </td>
                    <td className="px-6 py-4 text-muted text-xs">{inv.invoiceDate || "—"}</td>
                    <td className="px-6 py-4 font-semibold">{inv.supplierName}</td>
                    <td className="px-6 py-4">
                      <span className="rounded bg-wash px-2 py-1 text-xs font-medium">
                        {inv.lineItems.length} lines
                      </span>
                    </td>
                    <td className="px-6 py-4 tabular-nums">{formatCurrency(inv.subtotal, inv.currency)}</td>
                    <td className="px-6 py-4 tabular-nums">{formatCurrency(inv.vatAmount, inv.currency)}</td>
                    <td className="px-6 py-4 font-bold tabular-nums text-ink">{formatCurrency(inv.totalAmount, inv.currency)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button className="min-h-9 px-3 text-xs" onClick={() => setSelectedInvoiceId(inv.id)}>
                          <Eye className="mr-1 h-3.5 w-3.5" /> Review OCR
                        </Button>
                        <Button
                          variant="outline"
                          className="min-h-9 px-2 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                          title="Delete invoice"
                          onClick={() => {
                            if (window.confirm(`Delete invoice ${inv.invoiceNumber || "draft"}? This cannot be undone.`)) {
                              deleteInvoice(inv.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-muted" />
            <h3 className="mt-4 text-base font-semibold">No invoices in this queue</h3>
            <p className="mt-1 text-sm text-muted">Upload an invoice original or import via spreadsheet to start verification.</p>
            <Button className="mt-5" onClick={() => setShowUpload(true)}>
              <FileUp className="mr-1.5 h-4 w-4" /> Upload an invoice
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

