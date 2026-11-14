"use client";

import { CheckCircle2, FileUp, Loader2, Save, XCircle, FileSpreadsheet } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { InvoiceEditor } from "@/components/invoice-editor";
import { ExcelInvoiceImport, type InvoicePurpose } from "@/components/excel-invoice-import";
import { extractDocumentText } from "@/lib/document-extraction";
import { validateDocumentSignature } from "@/lib/document-validation";
import { matchDocumentAmount } from "@/lib/invoice-parsing";
import { parseInvoiceDate } from "@/lib/invoice-rules";
import { useAppState } from "@/components/app-state";
import { DocumentViewer } from "@/components/document-viewer";
import { Button } from "@/components/ui/button";
import { Card, Badge } from "@/components/ui/card";
import { useToast } from "@/components/toast-provider";
import type { CurrencyCode, Invoice, StoredDocument } from "@/lib/domain";
import { detectSupportedDocumentKind, type SupportedDocumentKind } from "@/lib/services";
import { calculateInvoiceTotals, calculateLine } from "@/lib/vat-calculations";
import { formatCurrency } from "@/lib/utils";
import { InvoiceWorkbench } from "@/components/invoice-workbench";
import { useUnsavedChanges } from "@/components/navigation-guard";

const stages = ["File checked", "Text reading finished", "Preparing editable fields", "Ready for review"];
const stageThresholds = [5, 85, 95, 100];
const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
type QuotationLine = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

type ExtractedQuotation = {
  id: string;
  documentId: string;
  supplierName: string;
  quotationNumber: string;
  quotationDate: string;
  validUntil: string;
  clientName: string;
  project: string;
  currency: CurrencyCode;
  vatRate: number;
  lines: QuotationLine[];
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
  confidence: "Medium" | "Needs review";
  notes: string;
};

function buildQuotationReview(document: StoredDocument, clientName: string, defaultCurrency: CurrencyCode): ExtractedQuotation {
  const text = (document.textContent ?? "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ");
  const supplierName = matchText(text, [/(?:supplier|vendor|seller|from)\s*[:#-]\s*([^\n|]{2,100})/i]) || text.split("\n").map((line) => line.trim()).find((line) => line.length >= 2 && line.length <= 100 && !/\b(?:quotation|quote|proposal|estimate|invoice|bill to|date|vat|total|page)\b/i.test(line) && !/^[\d\W]+$/.test(line)) || "";
  const quotationNumber = matchText(text, [
    /(?:quotation|quote|proposal|estimate)(?:\s+(?:number|no\.?|ref\.?|#))?\s*[:#-]\s*([A-Z0-9][A-Z0-9/.-]{1,30})/i,
    /^\s*(?:no\.?|ref\.?|reference)\s*[:#-]\s*([A-Z0-9][A-Z0-9/.-]{1,30})/im
  ]);
  const quotationDate = matchDocumentDate(text, ["quotation date", "quote date", "date issued", "date"]) ?? "";
  const validUntil = matchDocumentDate(text, ["valid until", "valid through", "expiry date", "expires on"]) ?? "";
  const client = matchText(text, [/(?:prepared for|client|customer|bill to)\s*[:#-]\s*([^\n|]{2,100})/i]);
  const project = matchText(text, [/(?:project|subject|scope of work)\s*[:#-]?\s*([^\n|]{2,120})/i]);
  const extractedSubtotal = matchDocumentAmount(text, "(?:net amount|net total|sub ?total|sub-total|goods total|taxable value|total before tax)");
  const extractedVat = matchDocumentAmount(text, "(?:vat amount|total vat|vat|gst|sales tax|tax amount)");
  const extractedTotal = matchDocumentAmount(text, "(?:total payable|amount due|grand total|gross total|quotation total|total due|total)");
  const subtotal = extractedSubtotal ?? 0;
  const vatAmount = extractedVat ?? (extractedSubtotal !== null && extractedTotal !== null ? Math.max(0, extractedTotal - extractedSubtotal) : 0);
  const totalAmount = extractedTotal ?? (extractedSubtotal !== null ? subtotal + vatAmount : 0);
  const description = matchText(text, [/(?:description|item|product|service)\s*[:#-]\s*([^\n|]{2,120})/i]);
  const currency: CurrencyCode = /\bEUR\b|€/.test(text) ? "EUR" : /\bUSD\b|\$/.test(text) ? "USD" : /\bGBP\b|£/.test(text) ? "GBP" : defaultCurrency;
  const vatRate = subtotal > 0 ? Math.round((vatAmount / subtotal) * 10000) / 100 : 0;
  const lineDescription = description || (subtotal > 0 ? "Extracted subtotal (line breakdown not detected)" : "");
  const lines = [{ id: `quote-line-${Date.now()}`, description: lineDescription, quantity: 1, unitPrice: subtotal, total: subtotal }];
  const vatWasDerived = extractedVat === null && extractedSubtotal !== null && extractedTotal !== null;
  return {
    id: `quotation-${Date.now()}`,
    documentId: document.id,
    supplierName,
    quotationNumber,
    quotationDate,
    validUntil,
    clientName: client || clientName,
    project,
    currency,
    vatRate,
    lines,
    subtotal,
    vatAmount,
    totalAmount,
    confidence: supplierName && quotationNumber && quotationDate && totalAmount > 0 && !vatWasDerived ? "Medium" : "Needs review",
    notes: text ? `${vatWasDerived ? "VAT is the difference between extracted gross and net totals. " : ""}Best-effort quotation extraction. Verify all values and any unitemized subtotal against the original.` : "No readable text was available. Complete the quotation fields manually before saving."
  };
}

function matchText(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const value = text.match(pattern)?.[1]?.replace(/\s+/g, " ").trim();
    if (value) return value;
  }
  return "";
}

function matchDocumentDate(text: string, labels: string[]) {
  const date = "(\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}[/. -]\\d{1,2}[/. -]\\d{2,4}|\\d{1,2}\\s+[A-Za-z]{3,9}\\s+\\d{4})";
  return parseInvoiceDate(matchText(text, labels.map((label) => new RegExp(`(?:${label})\\s*[:#-]?\\s*${date}`, "i"))));
}

export function InvoiceReviewWorkflow() {
  const { selectedCompany, invoices, suppliers, documents, addDocument, updateDocument, services } = useAppState();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<"ocr" | "excel">(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "excel") {
      return "excel";
    }
    return "ocr";
  });
  const [purpose, setPurpose] = useState<InvoicePurpose>("both");
  const [document, setDocument] = useState<StoredDocument | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [quotation, setQuotation] = useState<ExtractedQuotation | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [processing, setProcessing] = useState(false);
  const [reading, setReading] = useState(false);
  const [readingStatus, setReadingStatus] = useState("");
  const fileRef = useRef<File | null>(null);
  const request = useRef(0);
  const active = useRef<AbortController | null>(null);
  const guard = useUnsavedChanges(reading || Boolean(document && !invoices.some((item) => item.documentId === document.id)));
  useEffect(() => {
    request.current++;
    active.current?.abort();
    fileRef.current = null;
    setInvoice(null); setQuotation(null); setDocument(null); setReading(false); setProcessing(false); setProgress(0);
    return () => { request.current++; active.current?.abort(); };
  }, [selectedCompany.id]);

  const existingDocument = useMemo(() => {
    if (invoice) return documents.find((item) => item.id === invoice.documentId);
    if (quotation) return documents.find((item) => item.id === quotation.documentId);
    return document ?? undefined;
  }, [document, documents, invoice, quotation]);
  const currentDocumentKind: SupportedDocumentKind = existingDocument ? detectSupportedDocumentKind(existingDocument.fileName, existingDocument.textContent) : "invoice";

  const chooseFile = async (file: File | undefined, discardApproved = false) => {
    if (!file) return;
    if (!discardApproved && !guard.allowLeave()) return;
    const token = ++request.current;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    fileRef.current = file;
    setError(""); setNotice(""); setInvoice(null); setQuotation(null); setDocument(null); setProgress(0); setProcessing(false);
    if (!allowedTypes.includes(file.type)) { setError("Choose a PDF, JPG/JPEG, PNG or WEBP file."); setReading(false); return; }
    if (file.size > 10 * 1024 * 1024 || file.size === 0) { setError("Choose a non-empty file no larger than 10 MB."); setReading(false); return; }
    setReading(true); setReadingStatus("Checking document");
    const timeout = window.setTimeout(() => controller.abort(), 120000);
    let stored: StoredDocument | undefined;
    try {
      validateDocumentSignature(file.type, file.size, new Uint8Array(await file.slice(0, 1024).arrayBuffer()));
      if (token !== request.current || controller.signal.aborted) return;
      const localPreviewUrl = URL.createObjectURL(file);
      const hashBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
      if (token !== request.current || controller.signal.aborted) { URL.revokeObjectURL(localPreviewUrl); return; }
      const sha256Hash = Array.from(hashBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
      stored = { ...services.documents.upload({ fileName: file.name, mimeType: file.type, size: file.size, localPreviewUrl, sha256Hash }), companyId: selectedCompany.id };
      setDocument(stored); addDocument(stored); setProgress(5);
      const textContent = await extractDocumentText(file, controller.signal, (message, percent) => {
        if (token === request.current) { setReadingStatus(message); setProgress(percent); }
      });
      if (token !== request.current) return;
      stored = { ...stored, textContent };
      setDocument(stored); updateDocument(stored); setProgress(85);
      if (!textContent.trim()) setNotice("No readable text was found. Retry or enter details from the original manually.");
      else setNotice("Text extraction finished. Review and correct every field against the original.");
    } catch (reason) {
      if (token !== request.current) return;
      setProgress(0);
      setError(reason instanceof Error ? reason.message : "The document could not be read. It may be corrupt or unsupported.");
      if (stored) setNotice("The original is available in this session. Retry extraction or enter its details manually.");
    } finally {
      window.clearTimeout(timeout);
      if (token === request.current) { setReading(false); setReadingStatus(""); }
    }
  };

  const process = async () => {
    if (!document || reading) return;
    const token = request.current;
    const documentKind = detectSupportedDocumentKind(document.fileName, document.textContent);
    if (documentKind === "unsupported") {
      setError("This file does not look like an invoice or quotation. Financial details cannot be extracted from this unsupported document.");
      showToast({ title: "Document not processed", description: "Upload an invoice or quotation, or connect a real OCR service for arbitrary documents.", tone: "info" });
      return;
    }
    setProcessing(true);
    setProgress(95);
    try {
      if (documentKind === "quotation") {
        setQuotation(buildQuotationReview(document, selectedCompany.name, selectedCompany.currency));
        setInvoice(null);
        showToast({ title: "Quotation ready for review", description: "Best-effort text extraction is ready. Verify all values and fill any missing details.", tone: "success" });
      } else {
        const extracted = await services.processing.processInvoice(document, selectedCompany, invoices, suppliers);
        if (token !== request.current) return;
        setInvoice({ ...extracted, id: invoice?.id ?? extracted.id });
        setQuotation(null);

        // If purpose includes ORS, sync line items to ORS supplier invoices
        if (purpose === "ors" || purpose === "both") {
          try {
            await fetch("/api/ors/supplier-invoices", {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-company-id": selectedCompany.id
              },
              body: JSON.stringify({
                invoiceNumber: extracted.invoiceNumber,
                supplier: extracted.supplierName,
                invoiceDate: extracted.invoiceDate,
                dueDate: extracted.dueDate,
                currency: extracted.currency,
                subtotal: extracted.subtotal,
                vat: extracted.vatAmount,
                total: extracted.totalAmount,
                lines: extracted.lineItems.map((l) => ({
                  description: l.description,
                  quantity: l.quantity,
                  unitPrice: l.unitPrice,
                  vatRate: l.vatRate,
                  lineTotal: l.netAmount
                }))
              })
            });
          } catch {}
        }
        showToast({ title: "Invoice ready for review", description: "Editable fields are ready. Verify every value against the original; complete anything missing.", tone: "success" });
      }
      if (token === request.current) setProgress(100);
    } catch (reason) {
      setProgress(42);
      setError(reason instanceof Error ? reason.message : "This document could not be processed.");
      showToast({ title: "Document could not be processed", description: "No financial details were generated. Review the original or enter the invoice manually.", tone: "info" });
    } finally {
      if (token === request.current) setProcessing(false);
    }
  };

  const updateQuotationField = (field: keyof ExtractedQuotation, value: string) => {
    if (!quotation) return;
    setQuotation({ ...quotation, [field]: value });
  };

  const updateQuotationLine = (field: "description" | "quantity" | "unitPrice", value: string) => {
    if (!quotation) return;
    const lines = quotation.lines.map((line, index) => {
      if (index !== 0) return line;
      const next = {
        ...line,
        description: field === "description" ? value : line.description,
        quantity: field === "quantity" ? Number(value) : line.quantity,
        unitPrice: field === "unitPrice" ? Number(value) : line.unitPrice
      };
      return { ...next, total: calculateLine({ description: next.description, quantity: next.quantity, unitPrice: next.unitPrice, discount: 0, vatRate: 0 }).netAmount };
    });
    const totals = calculateInvoiceTotals(lines.map((line) => calculateLine({ ...line, discount: 0, vatRate: quotation.vatRate })));
    const subtotal = totals.subtotal;
    const vatAmount = totals.vatAmount;
    setQuotation({ ...quotation, lines, subtotal, vatAmount, totalAmount: subtotal + vatAmount });
  };

  if (quotation) {
    return (
      <div className="grid min-w-0 gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <DocumentViewer document={existingDocument} />
        <Card className="min-w-0 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold">Extracted quotation information</h2>
              <p className="mt-1 text-sm text-muted">Review quotation details separately from VAT invoice records.</p>
            </div>
            <Badge tone="amber">{quotation.confidence} confidence</Badge>
          </div>
          <div className="mt-5 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
            Quotation review is separate from invoices. Quotation saving and conversion are not connected; this review will not enter VAT reports.
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Field label="Supplier / vendor" value={quotation.supplierName} onChange={(value) => updateQuotationField("supplierName", value)} />
            <Field label="Quotation number" value={quotation.quotationNumber} onChange={(value) => updateQuotationField("quotationNumber", value)} />
            <Field label="Quotation date" type="date" value={quotation.quotationDate} onChange={(value) => updateQuotationField("quotationDate", value)} />
            <Field label="Valid until" type="date" value={quotation.validUntil} onChange={(value) => updateQuotationField("validUntil", value)} />
            <Field label="Client" value={quotation.clientName} onChange={(value) => updateQuotationField("clientName", value)} />
            <Field label="Project" value={quotation.project} onChange={(value) => updateQuotationField("project", value)} />
          </div>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-muted"><tr>{["Description", "Qty", "Unit", "Total"].map((item) => <th key={item} className="border-b border-line py-3">{item}</th>)}</tr></thead>
              <tbody>{quotation.lines.map((line) => <tr key={line.id} className="border-b border-line"><td className="py-3 pr-3"><input value={line.description} onChange={(e) => updateQuotationLine("description", e.target.value)} className="h-9 w-full rounded-md border border-line px-2" /></td><td><input type="number" value={line.quantity} onChange={(e) => updateQuotationLine("quantity", e.target.value)} className="h-9 w-20 rounded-md border border-line px-2" /></td><td><input type="number" value={line.unitPrice} onChange={(e) => updateQuotationLine("unitPrice", e.target.value)} className="h-9 w-24 rounded-md border border-line px-2" /></td><td className="font-semibold">{formatCurrency(line.total)}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="mt-6 grid gap-2 rounded-lg bg-wash p-4 text-sm">
            <Row label="Estimated net" value={formatCurrency(quotation.subtotal)} />
            <Row label="Estimated VAT" value={formatCurrency(quotation.vatAmount)} />
            <Row label="Estimated total" value={formatCurrency(quotation.totalAmount)} strong />
          </div>
          <p className="mt-4 text-sm leading-6 text-muted">{quotation.notes}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <p className="text-sm text-muted">Quotation saving is unavailable. This temporary review is excluded from VAT records.</p>
            <Button type="button" variant="outline" onClick={process}>Reprocess</Button>
            <Button type="button" variant="ghost" onClick={() => setQuotation(null)}><XCircle className="h-4 w-4" />Cancel</Button>
          </div>
        </Card>
      </div>
    );
  }

  if (invoice && currentDocumentKind !== "invoice") {
    return (
      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <DocumentViewer document={existingDocument} />
        <Card className="p-6">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
            <h2 className="text-xl font-bold text-amber-900">This document was not processed as a supported financial document</h2>
            <p className="mt-3 text-sm leading-6 text-amber-900">
              {existingDocument?.fileName ?? "This document"} looks like a quotation or another non-invoice file. Review the original and upload a valid invoice before creating a VAT record.
            </p>
          </div>
          <div className="mt-6 grid gap-3 text-sm text-muted">
            <p>Upload a supplier invoice or quotation file to extract its text for review.</p>
            <p>To extract real data from quotations, certificates, or arbitrary PDFs, connect a production PDF viewer and OCR/AI extraction adapter.</p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button type="button" onClick={() => { setInvoice(null); setDocument(null); setError(""); setProgress(0); }}><FileUp className="h-4 w-4" />Upload another file</Button>
            <Button type="button" variant="outline" onClick={() => { setInvoice(null); setError("This file is not a supported invoice or quotation, so no extraction was generated."); }}>Back to upload</Button>
          </div>
        </Card>
      </div>
    );
  }

  if (invoice) {
    return <InvoiceWorkbench document={existingDocument}>
      <InvoiceEditor key={invoice.id} initialInvoice={invoice} onCancel={() => setInvoice(null)} onRetry={() => { if (fileRef.current) void chooseFile(fileRef.current, true); }} />
    </InvoiceWorkbench>;
  }

  if (activeTab === "excel") {
    return (
      <div className="space-y-4">
        <div className="flex gap-2 border-b border-line pb-3">
          <Button variant="outline" className="min-h-9 px-3 text-xs" onClick={() => setActiveTab("ocr")}>
            <FileUp className="mr-1.5 h-4 w-4" /> Single Document OCR
          </Button>
          <Button className="min-h-9 px-3 text-xs bg-brand-700 text-white">
            <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel / CSV Bulk Import
          </Button>
        </div>
        <ExcelInvoiceImport onComplete={() => setActiveTab("ocr")} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Mode Switcher Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex gap-2">
          <Button className="min-h-9 px-3 text-xs bg-brand-700 text-white">
            <FileUp className="mr-1.5 h-4 w-4" /> Single Document OCR
          </Button>
          <Button variant="outline" className="min-h-9 px-3 text-xs" onClick={() => setActiveTab("excel")}>
            <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel / CSV Bulk Import
          </Button>
        </div>
        {/* Purpose selector pill */}
        <div className="flex items-center gap-1 rounded-lg border border-line bg-wash p-1 text-xs">
          <span className="px-2 font-semibold text-muted">Routing:</span>
          <button
            type="button"
            onClick={() => setPurpose("vat")}
            className={`rounded px-2.5 py-1 font-semibold transition-all ${
              purpose === "vat" ? "bg-brand-700 text-white shadow-xs" : "text-slate-600 hover:text-ink"
            }`}
          >
            Use for VAT
          </button>
          <button
            type="button"
            onClick={() => setPurpose("ors")}
            className={`rounded px-2.5 py-1 font-semibold transition-all ${
              purpose === "ors" ? "bg-brand-700 text-white shadow-xs" : "text-slate-600 hover:text-ink"
            }`}
          >
            Use for ORS
          </button>
          <button
            type="button"
            onClick={() => setPurpose("both")}
            className={`rounded px-2.5 py-1 font-semibold transition-all ${
              purpose === "both" ? "bg-brand-700 text-white shadow-xs" : "text-slate-600 hover:text-ink"
            }`}
          >
            Both (VAT &amp; ORS)
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <Card className="p-5">
          <label onDrop={(event) => { event.preventDefault(); chooseFile(event.dataTransfer.files[0]); }} onDragOver={(event) => event.preventDefault()} className="grid min-h-[280px] cursor-pointer place-items-center rounded-lg border-2 border-dashed border-line bg-wash p-5 text-center hover:border-brand-500 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-700 sm:p-8">
            <input aria-label="Choose invoice document" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void chooseFile(file); }} />
            <span>
              <FileUp className="mx-auto h-12 w-12 text-brand-700" />
              <span className="mt-4 block text-xl font-semibold">Upload a supplier invoice</span>
              <span className="mt-2 block text-sm text-muted">Drop your document here, or select to browse your files.</span>
              <span className="mt-4 block text-xs text-muted">JPG/JPEG, PNG, WEBP, PDF · up to 10 MB · PDF up to 20 pages</span>
            </span>
          </label>
        {reading ? <div role="status" className="mt-3 rounded-md bg-brand-50 p-3 text-sm"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />{readingStatus}<Button className="ml-3" variant="outline" onClick={() => active.current?.abort()}>Stop reading</Button></div> : null}
        {notice ? <p className="mt-3 min-w-0 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900 break-words">{notice}</p> : null}
        {error ? <p role="alert" className="mt-3 min-w-0 rounded-md bg-red-50 p-3 text-sm leading-6 text-red-700 break-words">{error}</p> : null}
        {document ? (
          <div className="mt-5 rounded-lg border border-line p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="font-bold">{document.fileName}</p><p className="text-sm text-muted">{document.fileType} - {document.sizeLabel}</p></div>
              <Button type="button" disabled={processing || reading} onClick={process}>{processing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{document.textContent ? "Process Document" : "Enter Details Manually"}</Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" disabled={reading || processing} onClick={() => { if (fileRef.current) void chooseFile(fileRef.current); }}>Retry extraction</Button><Button variant="outline" disabled={reading || processing} onClick={async () => { if (!document) return; const manual = await services.processing.processInvoice({ ...document, textContent: "" }, selectedCompany, invoices); setInvoice(manual); }}>Enter details manually</Button></div>
            {document.textContent ? <p className="mt-3 rounded-md bg-brand-50 p-3 text-sm text-brand-700">Text extracted: {document.textContent.length.toLocaleString("en-GB")} characters.</p> : null}
            {!document.textContent ? <p className="mt-3 rounded-md bg-white p-3 text-sm leading-6 text-muted">Manual review keeps the uploaded original on screen and opens editable invoice fields. Fill in only what you can verify from the document.</p> : null}
            {detectSupportedDocumentKind(document.fileName, document.textContent) === "unsupported" ? <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm leading-6 text-amber-800">This file does not look like an invoice or quotation. Enter the correct financial details manually from the original.</p> : null}
            <div role="progressbar" aria-label="Document extraction" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="mt-4 h-2 rounded-full bg-wash"><div className="h-2 rounded-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} /></div>
          </div>
        ) : null}
      </Card>
      <Card className="p-5">
        <h2 className="text-xl font-bold">Processing pipeline</h2>
        <div className="mt-5 grid gap-3">
          {stages.map((stage, index) => <div key={stage} className="flex items-center gap-3 rounded-md border border-line p-3 text-sm"><span className={`grid h-6 w-6 place-items-center rounded-full ${progress >= stageThresholds[index] ? "bg-brand-500 text-white" : "bg-wash text-muted"}`}>{progress >= stageThresholds[index] ? <CheckCircle2 className="h-4 w-4" /> : index + 1}</span>{stage}</div>)}
        </div>
        <p className="mt-5 text-sm leading-6 text-muted">Text extraction and English OCR prepare editable invoice details. Verify the source and complete any missing fields before confirming.</p>
      </Card>
    </div>
  </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="grid gap-2 text-sm font-semibold">{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="h-11 rounded-md border border-line px-3" /></label>;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className="flex justify-between gap-4"><span className="text-muted">{label}</span><span className={strong ? "text-lg font-bold" : "font-semibold"}>{value}</span></div>;
}
