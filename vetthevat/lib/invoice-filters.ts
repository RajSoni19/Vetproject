import type { Invoice, StoredDocument } from "@/lib/domain";
import { parseInvoiceDate } from "@/lib/invoice-rules";

export type LocalInvoiceFilters = { companyId: string; query?: string; status?: string; dateFrom?: string; dateTo?: string; currency?: string; supplierId?: string; transactionType?: string };
export function filterInvoices(invoices: Invoice[], filters: LocalInvoiceFilters, documents: StoredDocument[] = []) {
  const dateFrom = filters.dateFrom ? parseInvoiceDate(filters.dateFrom) : "";
  const dateTo = filters.dateTo ? parseInvoiceDate(filters.dateTo) : "";
  if (dateFrom === null || dateTo === null) return [];
  filters = { ...filters, dateFrom, dateTo };
  if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) return [];
  const query = (filters.query ?? "").trim().toLowerCase();
  return invoices.filter((invoice) => invoice.companyId === filters.companyId && (!filters.status || filters.status === "All" || invoice.status === filters.status) && (!filters.transactionType || filters.transactionType === "All" || (invoice.transactionType??"Unclassified") === filters.transactionType) && (!filters.currency || filters.currency === "All" || invoice.currency === filters.currency) && (!filters.supplierId || invoice.supplierId === filters.supplierId) && (!filters.dateFrom || invoice.invoiceDate >= filters.dateFrom) && (!filters.dateTo || Boolean(invoice.invoiceDate) && invoice.invoiceDate <= filters.dateTo) && `${invoice.invoiceNumber} ${invoice.supplierName} ${invoice.customerName} ${documents.find((document) => document.id === invoice.documentId)?.fileName ?? ""}`.toLowerCase().includes(query));
}
