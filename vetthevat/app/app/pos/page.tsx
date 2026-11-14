"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppState } from "@/components/app-state";
import { InvoiceEditor } from "@/components/invoice-editor";
import { PageHeader } from "@/components/workspace-kit";
import { createInvoiceDraft } from "@/lib/invoice-rules";

export default function PosPage() {
  const { selectedCompany, storageReady } = useAppState();
  return <><PageHeader title="POS invoice" description="Create a manual invoice with line items, payment information and VAT totals. Saved in this browser only." />{storageReady ? <PosDraft key={selectedCompany.id} /> : <p role="status">Loading local workspace?</p>}</>;
}
function PosDraft() {
  const { selectedCompany } = useAppState();
  const router = useRouter();
  const [invoice] = useState(() => ({ ...createInvoiceDraft(selectedCompany), paymentStatus: "Unpaid" }));
  return <InvoiceEditor initialInvoice={invoice} showPayment onCancel={() => router.push("/app/invoices")} />;
}
