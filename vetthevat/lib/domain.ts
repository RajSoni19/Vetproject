export type CurrencyCode = "GBP" | "EUR" | "USD";
export type InvoiceStatus = "Draft" | "Processed" | "Pending Review" | "Reviewed" | "Duplicate Warning" | "Processing Failed";
export type ProcessingStatus = "Uploaded" | "Processing" | "Ready for Review" | "Confirmed" | "Failed";
export type ReviewStatus = "Needs Review" | "Reviewed" | "Not Required";
export type DocumentType = "PDF" | "Image";

export type Company = {
  id: string;
  name: string;
  registrationNumber: string;
  vatNumber: string;
  address: string;
  country: string;
  currency: CurrencyCode;
  industry: string;
  status: "Active" | "Review" | "Archived";
  vatPeriodStart?: string;
  vatPeriodEnd?: string;
};

export type Supplier = {
  id: string;
  companyId?: string;
  name: string;
  email: string;
  phone: string;
  vatNumber: string;
  address: string;
  status: "Active" | "Review" | "Archived";
};

export type Customer = Omit<Supplier, "companyId"> & { companyId: string };

export type StoredDocument = {
  id: string;
  companyId?: string;
  fileName: string;
  fileType: DocumentType;
  mimeType: string;
  sizeLabel: string;
  byteSize?: number;
  sha256Hash?: string;
  textContent?: string;
  localPreviewUrl?: string;
  uploadedAt: string;
  previewUrl: string;
  secureUrl: string;
  status: "Processed" | "Unprocessed" | "Needs Review";
  associatedInvoiceId?: string;
  associatedSupplierId?: string;
};

export type InvoiceLineItem = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  vatRate: number;
  netAmount: number;
  vatAmount: number;
  grossAmount: number;
  confidence: "High" | "Needs review";
  taxClassification?: "Taxable" | "Zero-rated" | "Exempt" | "Out of scope";
};

export type VATBreakdown = {
  rate: number;
  netAmount: number;
  vatAmount: number;
  grossAmount: number;
};

export type DataQualityWarning = {
  id: string;
  tone: "warning" | "danger" | "info";
  title: string;
  description: string;
};

export type AuditEvent = {
  id: string;
  companyId?: string;
  user: string;
  action: string;
  entity: string;
  details: string;
  createdAt: string;
};

export type Invoice = {
  id: string;
  companyId: string;
  supplierId: string;
  documentId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  currency: CurrencyCode;
  supplierName: string;
  supplierVatNumber: string;
  customerId?: string;
  customerName: string;
  customerVatNumber: string;
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
  vatBreakdown: VATBreakdown[];
  lineItems: InvoiceLineItem[];
  status: InvoiceStatus;
  processingStatus: ProcessingStatus;
  reviewStatus: ReviewStatus;
  confidence: "High" | "Medium" | "Needs review";
  warnings: DataQualityWarning[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
  activity: AuditEvent[];
  sourceTotals?: { subtotal: number | null; vatAmount: number | null; totalAmount: number | null };
  vatRateNeedsReview?: boolean;
  paymentStatus?: string;
  transactionType?: "Purchase" | "Sale";
};

export type SupportTicket = {
  id: string;
  companyId?: string;
  category?: string;
  attachmentNames?: string[];
  subject: string;
  created: string;
  status: "Open" | "In Progress" | "Waiting for Customer" | "Resolved";
  lastUpdate: string;
  messages: { author: string; body: string }[];
};

export type NotificationItem = {
  id: string;
  companyId?: string;
  title: string;
  description: string;
  createdAt: string;
  tone: "success" | "warning" | "info";
  read: boolean;
};

export type TeamMember = {
  id: string;
  companyId?: string;
  name: string;
  email: string;
  role: "Owner" | "Admin" | "Finance" | "Accountant" | "Staff" | "Viewer";
  status: "Active" | "Invited" | "Invitation Draft" | "Deactivated";
  lastActive: string;
};

export type WorkspaceSettings = {
  profileName: string;
  email: string;
  notificationsEnabled: boolean;
};
