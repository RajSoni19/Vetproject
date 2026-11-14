import type { Invoice, StoredDocument, Supplier } from "@/lib/domain";

export function companyDocuments(documents: StoredDocument[], invoices: Invoice[], companyId: string) {
  return documents.filter(document => document.companyId === companyId || (!document.companyId && invoices.some(invoice => invoice.companyId === companyId && invoice.documentId === document.id)));
}
export function documentSupplier(document: StoredDocument, invoices: Invoice[], companyId: string) {
  return invoices.find(invoice => invoice.companyId === companyId && (invoice.id === document.associatedInvoiceId || invoice.documentId === document.id))?.supplierId || document.associatedSupplierId || "";
}
export function supplierReview(invoices: Invoice[], suppliers: Supplier[], companyId: string) {
  return invoices.filter(invoice => invoice.companyId === companyId && (!invoice.supplierId || !suppliers.some(supplier => supplier.id === invoice.supplierId && supplier.companyId === companyId) || invoice.confidence === "Needs review"));
}
export function associateDocument(document: StoredDocument, invoice: Invoice | undefined, supplier: Supplier | undefined, invoices: Invoice[], companyId: string): StoredDocument {
  if (document.companyId !== companyId && !(document.companyId === undefined && invoices.some(row=>row.documentId===document.id&&row.companyId===companyId))) throw new Error("Document belongs to another company.");
  if (invoice && invoice.companyId !== companyId || supplier && supplier.companyId !== companyId) throw new Error("Choose records from this company.");
  const existing = invoices.find(row=>row.documentId===document.id);
  if (existing && existing.id !== invoice?.id) throw new Error("This original is already linked. Edit its invoice instead of reassigning it.");
  if (invoice?.documentId && invoice.documentId !== document.id) throw new Error("That invoice already has an original. Restore its original instead.");
  if (invoice && supplier && invoice.supplierId !== supplier.id) throw new Error("Supplier must match the linked invoice. Correct the invoice first.");
  return {...document, companyId, associatedInvoiceId:invoice?.id, associatedSupplierId:invoice?.supplierId || supplier?.id, status:invoice?.documentId===document.id&&invoice.reviewStatus==="Reviewed"&&invoice.processingStatus==="Confirmed"?"Processed":"Needs Review"};
}
