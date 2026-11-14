import type { Invoice } from "@/lib/domain";
import { VetTheVatApiClient } from "@/lib/api/client";
import type { InvoiceFilters, PaginatedResult, UploadInvoiceResponse, VetTheVatApi } from "@/lib/api/contracts";

export class AndroidBackendApi implements Partial<VetTheVatApi> {
  constructor(private readonly client: VetTheVatApiClient) {}

  listInvoices(filters: InvoiceFilters): Promise<PaginatedResult<Invoice>> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") params.set(key, String(value));
    });
    return this.client.request(`/v1/invoices?${params.toString()}`);
  }

  getInvoice(id: string): Promise<Invoice> {
    return this.client.request(`/v1/invoices/${encodeURIComponent(id)}`);
  }

  async uploadInvoice(file: File, companyId: string): Promise<UploadInvoiceResponse> {
    const form = new FormData();
    form.set("file", file);
    form.set("companyId", companyId);
    return this.client.request("/v1/invoices/uploads", {
      method: "POST",
      body: form
    });
  }

  verifyInvoice(invoice: Invoice): Promise<Invoice> {
    return this.client.request(`/v1/invoices/${encodeURIComponent(invoice.id)}/verify`, {
      method: "POST",
      body: JSON.stringify(invoice)
    });
  }

  createDocumentDownloadUrl(documentId: string): Promise<{ url: string; expiresAt: string }> {
    return this.client.request(`/v1/documents/${encodeURIComponent(documentId)}/download-url`, {
      method: "POST"
    });
  }
}
