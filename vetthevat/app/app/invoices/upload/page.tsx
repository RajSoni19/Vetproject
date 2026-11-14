import { InvoiceReviewWorkflow } from "@/components/invoice-review-workflow";
import { PageHeader } from "@/components/workspace-kit";

export default function UploadInvoicePage() {
  return (
    <>
      <PageHeader title="Upload supplier invoice" description="Read digital PDFs or use English OCR for scans and images, then compare and correct every field. Files remain available only in this upload session." />
      <InvoiceReviewWorkflow />
    </>
  );
}
