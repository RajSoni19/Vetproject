"use client";

import { use, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAppState } from "@/components/app-state";
import { InvoiceWorkbench } from "@/components/invoice-workbench";
import { InvoiceEditor } from "@/components/invoice-editor";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { invoices, documents } = useAppState();

  const invoice = useMemo(() => invoices.find((inv) => inv.id === id), [invoices, id]);
  const document = useMemo(() => invoice?.documentId ? documents.find((doc) => doc.id === invoice.documentId) : undefined, [invoice, documents]);

  if (!invoice) {
    return (
      <Card className="p-8 text-center">
        <h2 className="text-xl font-bold">Invoice Not Found</h2>
        <p className="mt-2 text-sm text-muted">The requested invoice could not be located in this workspace.</p>
        <Button className="mt-5" onClick={() => router.push("/app/invoices")}>
          Back to Invoices
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <div>
          <h2 className="text-xl font-bold">Edit Invoice {invoice.invoiceNumber || invoice.id}</h2>
          <p className="text-xs text-muted">Update values, tax treatments or line items.</p>
        </div>
        <Link href={`/app/invoices/${invoice.id}`} className="text-sm font-semibold text-brand-700 underline">
          &larr; View Invoice
        </Link>
      </div>

      <InvoiceWorkbench document={document}>
        <InvoiceEditor
          initialInvoice={invoice}
          onCancel={() => router.push(`/app/invoices/${invoice.id}`)}
          onSaved={() => router.push(`/app/invoices/${invoice.id}`)}
        />
      </InvoiceWorkbench>
    </div>
  );
}
