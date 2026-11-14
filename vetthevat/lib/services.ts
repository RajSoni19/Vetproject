"use client";

import { browserReportExportService as reportService } from "@/lib/report-exports";
import type { ReportFilters } from "@/lib/reporting";
import type { Company, DataQualityWarning, Invoice, StoredDocument, Supplier } from "@/lib/domain";
import { buildVATBreakdown, calculateInvoiceTotals, calculateLine, validateInvoiceTotals } from "@/lib/vat-calculations";
import { findDuplicateInvoice } from "@/lib/invoice-rules";
import { extractInvoiceFields } from "@/lib/invoice-text-extraction";
import { toMinorUnits } from "@/lib/money";

export type UploadedDocumentInput = {
  fileName: string;
  mimeType: string;
  size: number;
  textContent?: string;
  localPreviewUrl?: string;
  sha256Hash?: string;
};

export interface DocumentStorageService {
  upload(file: UploadedDocumentInput): StoredDocument;
  getPreviewUrl(document: StoredDocument): string;
  getSecureUrl(document: StoredDocument): string;
  getOriginalUrl(document: StoredDocument): string;
}

export interface InvoiceProcessingService {
  processInvoice(document: StoredDocument, company: Company, existingInvoices: Invoice[], suppliers?: Supplier[]): Promise<Invoice>;
}

export interface ReportExportService {
  exportExcel(invoices: Invoice[], documents: StoredDocument[], company: Company, filters?: ReportFilters): void;
  exportPdf(invoices: Invoice[], company: Company, filters?: ReportFilters, documents?: StoredDocument[]): void;
}

function sizeLabel(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export type SupportedDocumentKind = "invoice" | "quotation" | "unsupported";

export function detectSupportedDocumentKind(fileName: string, textContent = ""): SupportedDocumentKind {
  const normalised = fileName.toLowerCase();
  const text = textContent.toLowerCase().replace(/\s+/g, " ");
  const quotationSignal = /\b(?:quotation|quote|proposal|estimate)\b/;
  // "Please quote invoice number INV-1 when paying" is an instruction on an
  // invoice, not a quotation: a numbered or dated invoice always wins.
  const numberedInvoice = /\b(?:tax\s+invoice|invoice\s*(?:#|no\b|number|num\b|date)|inv\s*(?:#|no\b))/;
  const quotationTitle = /\b(?:quotation|proposal|estimate)\b|\bquote\s*(?:#|no\b|number|date|valid)|\bquote\b(?!\s+(?:this|the|your|our|invoice|inv|ref|reference|number|no|account|order)\b)/;
  const invoiceSignal = /\b(?:tax\s+invoice|invoice|bill|receipt|amount\s+due|payment\s+due|vat|gst|subtotal|total\s+payable)\b/;
  const unsupportedWords = /\b(?:certificate|resume|cv|passport|award|degree)\b/;

  if (quotationSignal.test(normalised)) return "quotation";
  if (numberedInvoice.test(text)) return "invoice";
  if (quotationTitle.test(text)) return "quotation";
  if (invoiceSignal.test(normalised) || invoiceSignal.test(text)) return "invoice";
  if (unsupportedWords.test(normalised) || unsupportedWords.test(text)) return "unsupported";

  // This upload flow is explicitly for invoices or quotations, including unfamiliar supplier formats.
  return "invoice";
}

export function looksLikeSupplierInvoice(fileName: string, textContent = "") {
  return detectSupportedDocumentKind(fileName, textContent) === "invoice";
}

export function looksLikeQuotation(fileName: string, textContent = "") {
  return detectSupportedDocumentKind(fileName, textContent) === "quotation";
}

export const browserDocumentStorageService: DocumentStorageService = {
  upload(file) {
    const id = `doc-${crypto.randomUUID()}`;
    return {
      id,
      fileName: file.fileName,
      fileType: file.mimeType.includes("pdf") ? "PDF" : "Image",
      mimeType: file.mimeType,
      sizeLabel: sizeLabel(file.size),
      byteSize: file.size,
      sha256Hash: file.sha256Hash,
      textContent: file.textContent,
      localPreviewUrl: file.localPreviewUrl,
      uploadedAt: new Date().toISOString(),
      previewUrl: `/app/documents/${id}`,
      secureUrl: `/app/documents/${id}`,
      status: "Unprocessed"
    };
  },
  getPreviewUrl(document) {
    return document.previewUrl;
  },
  getSecureUrl(document) {
    return document.secureUrl;
  },
  getOriginalUrl(document) {
    if (!document.localPreviewUrl) throw new Error("The original file is unavailable in this session. Durable storage is not connected.");
    return document.localPreviewUrl;
  }
};

// Links an extracted supplier to one the company has already saved, by VAT
// number first and then by name, so repeat suppliers are never re-keyed.
function matchSavedSupplier(name: string, vatNumber: string, companyId: string, suppliers: Supplier[]) {
  const vat = (value: string) => value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().replace(/^GB(?=\d{9})/, "");
  const key = (value: string) => value.toLowerCase().replace(/\b(?:limited|ltd|plc|llp|the|cash\s*(?:&|and)\s*carry)\b|[^a-z0-9]/g, "");
  const scope = suppliers.filter((row) => (!row.companyId || row.companyId === companyId) && row.status !== "Archived");
  const byVat = vatNumber ? scope.filter((row) => row.vatNumber && vat(row.vatNumber) === vat(vatNumber)) : [];
  if (byVat.length === 1) return byVat[0];
  const target = key(name);
  if (target.length < 3) return undefined;
  const exact = scope.filter((row) => key(row.name) === target);
  if (exact.length === 1) return exact[0];
  // "Temple" saved, "Temple Wines Cash & Carry Limited" printed (or the reverse).
  const partial = scope.filter((row) => { const saved = key(row.name); return saved.length >= 4 && target.length >= 4 && (saved.startsWith(target) || target.startsWith(saved) || saved.includes(target) || target.includes(saved)); });
  return partial.length === 1 ? partial[0] : undefined;
}

export const browserInvoiceProcessingService: InvoiceProcessingService = {
  async processInvoice(document, company, existingInvoices, suppliers = []) {
    const text = document.textContent ?? "";
    const fields = extractInvoiceFields(text, { companyName: company.name, companyVatNumber: company.vatNumber });
    const saved = matchSavedSupplier(fields.supplierName, fields.supplierVatNumber, company.id, suppliers);
    const supplierName = saved?.name ?? fields.supplierName;
    const supplierVatNumber = fields.supplierVatNumber || saved?.vatNumber || "";
    const extractedNet = fields.read.net, extractedVat = fields.read.vat, extractedTotal = fields.read.gross;

    const parsedLines = fields.lines.map((item) => {
      // Keep quantity x price consistent with the printed line amount.
      let unitPrice = item.unitPrice;
      if (toMinorUnits(calculateLine({ description: "", quantity: item.quantity, unitPrice, discount: 0, vatRate: 0 }).netAmount) !== toMinorUnits(item.netAmount)) unitPrice = Math.round(item.netAmount / item.quantity * 10000) / 10000;
      return calculateLine({ description: item.description, quantity: item.quantity, unitPrice, discount: 0, vatRate: item.vatRate ?? 0, ...(item.taxClassification ? { taxClassification: item.taxClassification } : {}) });
    });
    // No line table found: one summary line carrying the invoice net.
    const summaryRate = fields.net && fields.vat !== null ? Math.round((fields.vat / fields.net) * 10000) / 100 : 0;
    const lines = parsedLines.length ? parsedLines : [calculateLine({
      description: fields.net ? "Extracted invoice subtotal" : "",
      quantity: 1,
      unitPrice: fields.net ?? 0,
      discount: 0,
      vatRate: summaryRate
    })];
    const calculatedTotals = calculateInvoiceTotals(lines);
    const totals = {
      subtotal: fields.net ?? calculatedTotals.subtotal,
      vatAmount: fields.vat ?? calculatedTotals.vatAmount,
      totalAmount: fields.gross ?? (fields.net !== null ? fields.net + (fields.vat ?? 0) : calculatedTotals.totalAmount)
    };
    const supplierId = saved?.id ?? (supplierName ? `supplier-${supplierName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}` : "supplier-unassigned");
    const invoiceNumber = fields.invoiceNumber;
    const duplicate = findDuplicateInvoice({ id: "", companyId: company.id, supplierId, supplierName, invoiceNumber }, existingInvoices);
    const reconciliation = validateInvoiceTotals(totals.totalAmount, calculatedTotals.totalAmount);
    const invoiceDate = fields.invoiceDate;
    const vatRateNeedsReview = fields.vatNeedsReview;
    const warnings: DataQualityWarning[] = [];
    if (!parsedLines.length) warnings.push({ id: "line-review", tone: "warning", title: "Line breakdown not detected", description: "Only a subtotal line could be prepared. Check the original and complete or confirm the actual line items." });
    if (vatRateNeedsReview && text.trim()) warnings.push({ id: "vat-missing", tone: "warning", title: "VAT treatment missing", description: "Select and explicitly confirm each line's VAT treatment. Missing VAT does not mean zero-rated." });
    if (!text.trim()) warnings.push({ id: "no-readable-text", tone: "warning", title: "Enter details manually", description: "The document could not be read automatically. Use the original invoice to complete the missing fields." });
    if (duplicate) warnings.push({ id: "duplicate", tone: "danger", title: "Possible duplicate invoice", description: `This invoice appears similar to ${duplicate.invoiceNumber}.` });
    if (!reconciliation.isValid) warnings.push({ id: "totals-mismatch", tone: "warning", title: "Totals need checking", description: "The extracted gross amount does not match the line-item calculation." });
    if (!supplierName || !invoiceNumber || !invoiceDate || fields.net === null || fields.gross === null) {
      const missing = [!supplierName && "supplier", !invoiceNumber && "invoice number", !invoiceDate && "invoice date", fields.net === null && "net total", fields.gross === null && "gross total"].filter(Boolean).join(", ");
      warnings.push({ id: "missing-fields", tone: "warning", title: "Complete missing invoice details", description: `Not found on the document: ${missing}. Add them before confirming.` });
    }
    fields.notes.forEach((note, index) => warnings.push({ id: `extraction-note-${index}`, tone: "warning", title: "Check against the original", description: note }));

    return {
      id: `invoice-${crypto.randomUUID()}`,
      companyId: company.id,
      supplierId,
      documentId: document.id,
      invoiceNumber,
      invoiceDate: invoiceDate ?? "",
      dueDate: fields.dueDate ?? "",
      currency: fields.currency ?? company.currency,
      supplierName,
      supplierVatNumber,
      customerName: fields.customerName || company.name,
      customerVatNumber: fields.customerVatNumber || company.vatNumber,
      ...totals,
      sourceTotals: { subtotal: extractedNet, vatAmount: extractedVat, totalAmount: extractedTotal },
      vatRateNeedsReview,
      vatBreakdown: buildVATBreakdown(lines),
      lineItems: lines,
      status: duplicate ? "Duplicate Warning" : "Pending Review",
      processingStatus: "Ready for Review",
      reviewStatus: "Needs Review",
      confidence: warnings.some((warning) => warning.tone === "warning") ? "Needs review" : "Medium",
      warnings,
      notes: text ? "Best-effort text extraction. Verify every field against the original before saving." : "Complete the invoice fields manually from the original document before saving.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      activity: [
        { id: `audit-${Date.now()}-1`, user: "Local workspace user", action: "Invoice uploaded", entity: invoiceNumber || document.fileName, details: "Original available in this browser session only", createdAt: new Date().toLocaleString("en-GB") },
        { id: `audit-${Date.now()}-2`, user: "Local workspace user", action: "Invoice processed", entity: invoiceNumber || document.fileName, details: "Best-effort extraction produced editable invoice fields", createdAt: new Date().toLocaleString("en-GB") }
      ]
    };
  }
};

export const browserReportExportService: ReportExportService = reportService;
