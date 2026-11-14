import type { Company, Invoice, StoredDocument, Supplier, TeamMember } from "@/lib/domain";

export type PaginatedResult<T> = {
  items: T[];
  nextCursor?: string;
};

export type InvoiceFilters = {
  query?: string;
  supplierId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  cursor?: string;
  limit?: number;
};

export type UploadInvoiceResponse = {
  document: StoredDocument;
  processingJob: {
    id: string;
    status: "uploaded" | "queued" | "processing" | "review_required" | "verified" | "failed";
  };
};

export interface VetTheVatApi {
  listCompanies(): Promise<Company[]>;
  listInvoices(filters: InvoiceFilters): Promise<PaginatedResult<Invoice>>;
  getInvoice(id: string): Promise<Invoice>;
  uploadInvoice(file: File, companyId: string): Promise<UploadInvoiceResponse>;
  verifyInvoice(invoice: Invoice): Promise<Invoice>;
  listSuppliers(companyId: string): Promise<Supplier[]>;
  listTeamMembers(companyId: string): Promise<TeamMember[]>;
  inviteTeamMember(input: { companyId: string; email: string; role: TeamMember["role"] }): Promise<TeamMember>;
  createDocumentDownloadUrl(documentId: string): Promise<{ url: string; expiresAt: string }>;
}
