// Historical fixtures for offline regression tests ONLY. Never import from app/lib/components.
import type { AuditEvent, Company, Invoice, NotificationItem, StoredDocument, Supplier, SupportTicket, TeamMember } from "@/lib/domain";

export const playStoreUrl = "https://play.google.com/store/apps/details?id=com.vetthevat.myapp";

export const companies: Company[] = [
  {
    id: "company-demo-business",
    name: "Demo Business Ltd",
    registrationNumber: "11223344",
    vatNumber: "GB 123 4567 89",
    address: "24 King Street, Manchester M2 4LG",
    country: "United Kingdom",
    currency: "GBP",
    industry: "Professional services",
    status: "Active"
  },
  {
    id: "company-retail",
    name: "Demo Retail Group",
    registrationNumber: "55667788",
    vatNumber: "GB 987 6543 21",
    address: "17 Market Road, Birmingham B1 1AA",
    country: "United Kingdom",
    currency: "GBP",
    industry: "Retail",
    status: "Review"
  }
];

export const suppliers: Supplier[] = [
  { id: "supplier-abc", name: "ABC Supplies Ltd", email: "accounts@abc-supplies.example", phone: "020 7946 0120", vatNumber: "GB 246 8101 22", address: "8 Foundry Lane, Leeds LS1 4AB", status: "Active" },
  { id: "supplier-northbridge", name: "Northbridge Office Supplies Ltd", email: "billing@northbridge.example", phone: "020 7946 0188", vatNumber: "GB 135 7913 57", address: "41 Station Road, Reading RG1 2EF", status: "Active" },
  { id: "supplier-westfield", name: "Westfield Wholesale Ltd", email: "finance@westfield.example", phone: "020 7946 0144", vatNumber: "GB 444 2211 08", address: "12 Harbour Way, Bristol BS1 6QF", status: "Review" }
];

export const documents: StoredDocument[] = [
  { id: "doc-abc-1025", fileName: "abc_supplies_inv_1025.pdf", fileType: "PDF", mimeType: "application/pdf", sizeLabel: "184 KB", uploadedAt: "2026-10-02T09:20:00", previewUrl: "/app/documents/doc-abc-1025", secureUrl: "/app/documents/doc-abc-1025", status: "Processed", associatedInvoiceId: "invoice-1025", associatedSupplierId: "supplier-abc" },
  { id: "doc-northbridge-8804", fileName: "northbridge_8804.png", fileType: "Image", mimeType: "image/png", sizeLabel: "742 KB", uploadedAt: "2026-10-04T13:14:00", previewUrl: "/app/documents/doc-northbridge-8804", secureUrl: "/app/documents/doc-northbridge-8804", status: "Needs Review", associatedInvoiceId: "invoice-8804", associatedSupplierId: "supplier-northbridge" },
  { id: "doc-westfield-4481", fileName: "westfield_wholesale_4481.pdf", fileType: "PDF", mimeType: "application/pdf", sizeLabel: "211 KB", uploadedAt: "2026-09-28T11:02:00", previewUrl: "/app/documents/doc-westfield-4481", secureUrl: "/app/documents/doc-westfield-4481", status: "Processed", associatedInvoiceId: "invoice-4481", associatedSupplierId: "supplier-westfield" }
];

const baseActivity: AuditEvent[] = [
  { id: "audit-1", user: "Demo User", action: "Invoice uploaded", entity: "Invoice", details: "Original supplier invoice attached to record", createdAt: "2026-10-02 09:20" },
  { id: "audit-2", user: "Demo User", action: "Invoice processed", entity: "Invoice", details: "Mock extraction completed", createdAt: "2026-10-02 09:21" }
];

export const invoices: Invoice[] = [
  {
    id: "invoice-1025",
    companyId: "company-demo-business",
    supplierId: "supplier-abc",
    documentId: "doc-abc-1025",
    invoiceNumber: "INV-1025",
    invoiceDate: "2026-10-02",
    dueDate: "2026-11-02",
    currency: "GBP",
    supplierName: "ABC Supplies Ltd",
    supplierVatNumber: "GB 246 8101 22",
    customerName: "Demo Business Ltd",
    customerVatNumber: "GB 123 4567 89",
    subtotal: 500,
    vatAmount: 100,
    totalAmount: 600,
    vatBreakdown: [{ rate: 20, netAmount: 500, vatAmount: 100, grossAmount: 600 }],
    lineItems: [{ id: "line-1025-1", description: "Office equipment", quantity: 1, unitPrice: 500, discount: 0, vatRate: 20, netAmount: 500, vatAmount: 100, grossAmount: 600, confidence: "High" }],
    status: "Reviewed",
    processingStatus: "Confirmed",
    reviewStatus: "Reviewed",
    confidence: "High",
    warnings: [],
    notes: "Standard VAT invoice.",
    createdAt: "2026-10-02T09:20:00",
    updatedAt: "2026-10-02T09:26:00",
    activity: baseActivity
  },
  {
    id: "invoice-8804",
    companyId: "company-demo-business",
    supplierId: "supplier-northbridge",
    documentId: "doc-northbridge-8804",
    invoiceNumber: "NB-8804",
    invoiceDate: "2026-10-04",
    dueDate: "2026-10-30",
    currency: "GBP",
    supplierName: "Northbridge Office Supplies Ltd",
    supplierVatNumber: "GB 135 7913 57",
    customerName: "Demo Business Ltd",
    customerVatNumber: "GB 123 4567 89",
    subtotal: 1240,
    vatAmount: 248,
    totalAmount: 1488,
    vatBreakdown: [{ rate: 20, netAmount: 1240, vatAmount: 248, grossAmount: 1488 }],
    lineItems: [
      { id: "line-8804-1", description: "Printer toner multipack", quantity: 4, unitPrice: 95, discount: 0, vatRate: 20, netAmount: 380, vatAmount: 76, grossAmount: 456, confidence: "High" },
      { id: "line-8804-2", description: "Desk chairs", quantity: 2, unitPrice: 430, discount: 0, vatRate: 20, netAmount: 860, vatAmount: 172, grossAmount: 1032, confidence: "Needs review" }
    ],
    status: "Pending Review",
    processingStatus: "Ready for Review",
    reviewStatus: "Needs Review",
    confidence: "Medium",
    warnings: [{ id: "warn-missing-po", tone: "warning", title: "Purchase order not detected", description: "No purchase order/reference was found in the document." }],
    createdAt: "2026-10-04T13:14:00",
    updatedAt: "2026-10-04T13:15:00",
    activity: baseActivity
  },
  {
    id: "invoice-4481",
    companyId: "company-demo-business",
    supplierId: "supplier-westfield",
    documentId: "doc-westfield-4481",
    invoiceNumber: "WW-4481",
    invoiceDate: "2026-09-28",
    dueDate: "2026-10-28",
    currency: "GBP",
    supplierName: "Westfield Wholesale Ltd",
    supplierVatNumber: "GB 444 2211 08",
    customerName: "Demo Business Ltd",
    customerVatNumber: "GB 123 4567 89",
    subtotal: 760,
    vatAmount: 92,
    totalAmount: 852,
    vatBreakdown: [
      { rate: 20, netAmount: 360, vatAmount: 72, grossAmount: 432 },
      { rate: 5, netAmount: 400, vatAmount: 20, grossAmount: 420 }
    ],
    lineItems: [
      { id: "line-4481-1", description: "Packaging materials", quantity: 3, unitPrice: 120, discount: 0, vatRate: 20, netAmount: 360, vatAmount: 72, grossAmount: 432, confidence: "High" },
      { id: "line-4481-2", description: "Energy surcharge", quantity: 1, unitPrice: 400, discount: 0, vatRate: 5, netAmount: 400, vatAmount: 20, grossAmount: 420, confidence: "High" }
    ],
    status: "Reviewed",
    processingStatus: "Confirmed",
    reviewStatus: "Reviewed",
    confidence: "High",
    warnings: [],
    createdAt: "2026-09-28T11:02:00",
    updatedAt: "2026-09-28T11:09:00",
    activity: baseActivity
  },
  {
    id: "invoice-1025-duplicate",
    companyId: "company-demo-business",
    supplierId: "supplier-abc",
    documentId: "doc-abc-1025",
    invoiceNumber: "INV-1025",
    invoiceDate: "2026-10-02",
    dueDate: "2026-11-02",
    currency: "GBP",
    supplierName: "ABC Supplies Ltd",
    supplierVatNumber: "GB 246 8101 22",
    customerName: "Demo Business Ltd",
    customerVatNumber: "GB 123 4567 89",
    subtotal: 500,
    vatAmount: 100,
    totalAmount: 600,
    vatBreakdown: [{ rate: 20, netAmount: 500, vatAmount: 100, grossAmount: 600 }],
    lineItems: [{ id: "line-dup-1", description: "Office equipment", quantity: 1, unitPrice: 500, discount: 0, vatRate: 20, netAmount: 500, vatAmount: 100, grossAmount: 600, confidence: "High" }],
    status: "Duplicate Warning",
    processingStatus: "Ready for Review",
    reviewStatus: "Needs Review",
    confidence: "High",
    warnings: [{ id: "warn-duplicate", tone: "danger", title: "Possible duplicate invoice", description: "This invoice appears similar to INV-1025 from ABC Supplies Ltd." }],
    createdAt: "2026-10-05T10:35:00",
    updatedAt: "2026-10-05T10:36:00",
    activity: baseActivity
  }
];

export const tickets: SupportTicket[] = [
  { id: "SUP-2048", subject: "How do I export VAT records?", created: "2026-10-03", status: "In Progress", lastUpdate: "Today", messages: [{ author: "Demo User", body: "I need a clean export for the accountant before month end." }, { author: "VET THE VAT Support", body: "Use Reports > Export Excel. The demo generates a real workbook with document links." }] },
  { id: "SUP-2039", subject: "Adding another business", created: "2026-09-29", status: "Resolved", lastUpdate: "2 days ago", messages: [{ author: "Demo User", body: "Can I keep multiple company records in one account?" }, { author: "VET THE VAT Support", body: "Yes, supported plans can include multiple business records." }] }
];

export const teamMembers: TeamMember[] = [
  { id: "team-1", name: "Aisha Morgan", email: "aisha.finance@example.co.uk", role: "Owner", status: "Active", lastActive: "Today" },
  { id: "team-2", name: "Daniel Price", email: "daniel.accounts@example.co.uk", role: "Finance", status: "Active", lastActive: "Yesterday" },
  { id: "team-3", name: "Maya Singh", email: "maya.accountant@example.co.uk", role: "Accountant", status: "Invited", lastActive: "Pending" }
];

export const notifications: NotificationItem[] = [
  { id: "note-1", title: "Invoice ready for review", description: "NB-8804 needs one line item checked.", createdAt: "Today", tone: "warning", read: false },
  { id: "note-2", title: "Possible duplicate invoice", description: "INV-1025 appears similar to an existing record.", createdAt: "Today", tone: "warning", read: false },
  { id: "note-3", title: "Export completed", description: "VAT report workbook generated.", createdAt: "Yesterday", tone: "success", read: true }
];

export const auditLog: AuditEvent[] = [
  { id: "audit-global-1", user: "Demo User", action: "Invoice uploaded", entity: "NB-8804", details: "Document northbridge_8804.png uploaded", createdAt: "2026-10-04 13:14" },
  { id: "audit-global-2", user: "Demo User", action: "Invoice processed", entity: "NB-8804", details: "Mock extraction completed with one review warning", createdAt: "2026-10-04 13:15" },
  { id: "audit-global-3", user: "Demo User", action: "Invoice exported", entity: "VAT Report", details: "Excel report generated with original invoice hyperlinks", createdAt: "2026-10-05 09:45" },
  { id: "audit-global-4", user: "Demo User", action: "Supplier added", entity: "ABC Supplies Ltd", details: "Supplier record created", createdAt: "2026-09-25 10:04" }
];
