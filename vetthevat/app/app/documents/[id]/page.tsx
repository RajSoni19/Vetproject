"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, FileText, ReceiptText, Upload } from "lucide-react";
import { useAppState } from "@/components/app-state";
import { DocumentAssociation } from "@/components/document-association";
import { DocumentViewer } from "@/components/document-viewer";
import { DocumentSessionRestore } from "@/components/document-session-restore";
import { PageHeader, StatusBadge } from "@/components/workspace-kit";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const { documents, invoices, selectedCompany, storageReady } = useAppState();
  const document = documents.find((item) => item.id === params.id && (item.companyId === selectedCompany.id || (!item.companyId && invoices.some((invoice) => invoice.documentId === item.id && invoice.companyId === selectedCompany.id))));
  const invoice = document?.associatedInvoiceId ? invoices.find((item) => item.id === document.associatedInvoiceId && item.companyId === selectedCompany.id) : undefined;

  if (!storageReady) return <p role="status">Loading local workspace…</p>;
  if (!document) {
    return (
      <>
        <PageHeader
          title="Document not found"
          description="This document is not available in the current workspace session."
          action={<ButtonLink href="/app/invoices/upload"><Upload className="h-4 w-4" />Upload again</ButtonLink>}
        />
        <Card className="p-6">
          <p className="text-sm leading-6 text-muted">
            Uploaded files are kept in browser memory for preview. If the page was refreshed or opened in a new browser session, upload the invoice again to restore the original file preview.
          </p>
          <Link href="/app/documents" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-brand-700"><ArrowLeft className="h-4 w-4" />Back to documents</Link>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={document.fileName}
        description="Original uploaded evidence and linked invoice record."
        action={<StatusBadge status={document.status} />}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_0.72fr]">
        <DocumentViewer document={document} />
        <div className="grid content-start gap-6">
          <Card className="p-5">
            <div className="flex items-start gap-3">
              <FileText className="mt-1 h-5 w-5 text-brand-700" />
              <div>
                <h2 className="text-xl font-bold">Document details</h2>
                <div className="mt-4 grid gap-3 text-sm">
                  <Row label="Type" value={document.fileType} />
                  <Row label="Size" value={document.sizeLabel} />
                  <Row label="Uploaded" value={new Date(document.uploadedAt).toLocaleString("en-GB")} />
                  <Row label="Status" value={document.status} />
                </div>
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-start gap-3">
              <ReceiptText className="mt-1 h-5 w-5 text-brand-700" />
              <div className="min-w-0">
                <h2 className="text-xl font-bold">Linked invoice</h2>
                {invoice ? (
                  <>
                    <p className="mt-3 text-sm leading-6 text-muted">{invoice.supplierName} - {invoice.invoiceNumber}</p>
                    <ButtonLink href={`/app/invoices/${invoice.id}`} className="mt-5">Open Invoice Record</ButtonLink>
                  </>
                ) : (
                  <>
                    <p className="mt-3 text-sm leading-6 text-muted">This document has not been confirmed as an invoice record yet.</p>
                    <ButtonLink href="/app/invoices/upload" className="mt-5">Process Document</ButtonLink>
                  </>
                )}
              </div>
            </div>
          </Card>
          <DocumentAssociation key={document.id+selectedCompany.id} document={document}/><DocumentSessionRestore key={document.id} document={document} />
          {!document.localPreviewUrl ? (
            <Card className="border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
              The original file preview is available only during the active upload session with session-only storage. Upload the same file again if this page was opened after a refresh.
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4 border-b border-line pb-3"><span className="text-muted">{label}</span><span className="text-right font-semibold">{value}</span></div>;
}

