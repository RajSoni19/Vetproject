"use client";

import {ukDate,ukWorkbook} from "@/lib/uk-date";
import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { FileSpreadsheet, Upload, Download, CheckCircle2, AlertCircle, Trash2, ArrowRight, FileText, ExternalLink, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Badge } from "@/components/ui/card";
import { useAppState } from "@/components/app-state";
import { useToast } from "@/components/toast-provider";
import type { Invoice, InvoiceLineItem, Supplier, StoredDocument } from "@/lib/domain";
import { calculateLine, calculateInvoiceTotals, buildVATBreakdown } from "@/lib/vat-calculations";
import { formatCurrency } from "@/lib/utils";

export type InvoicePurpose = "vat" | "ors" | "both";

interface ParsedInvoiceRow {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  supplierName: string;
  customerName?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  netAmount: number;
  currency: string;
  direction: "Purchase" | "Sale";
  purpose: InvoicePurpose;
  pdfLink?: string;
}

interface GroupedInvoice {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  supplierName: string;
  customerName: string;
  currency: "GBP" | "EUR" | "USD";
  direction: "Purchase" | "Sale";
  purpose: InvoicePurpose;
  pdfLink: string;
  lines: InvoiceLineItem[];
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
  isValid: boolean;
  errors: string[];
}

export function ExcelInvoiceImport({ onComplete, onClose }: { onComplete?: () => void; onClose?: () => void }) {
  const { selectedCompany, invoices, saveInvoice, suppliers, saveSupplier, addDocument } = useAppState();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState("");
  const [defaultPurpose, setDefaultPurpose] = useState<InvoicePurpose>("both");
  const [groupedInvoices, setGroupedInvoices] = useState<GroupedInvoice[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const handleFileUpload = (file: File) => {
    if (!file) return;
    setFileName(file.name);
    setIsProcessing(true);
    setImportStatus(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result;
        const workbook = XLSX.read(buffer, { type: "binary", cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

        if (!rawJson.length) {
          showToast({ title: "Empty Spreadsheet", description: "No records found in this file.", tone: "info" });
          setIsProcessing(false);
          return;
        }

        const parsedRows: ParsedInvoiceRow[] = rawJson.map((row: any) => {
          const findVal = (keys: string[]): any => {
            for (const k of Object.keys(row)) {
              const clean = k.toLowerCase().replace(/[^a-z0-9]/g, "");
              if (keys.includes(clean)) return row[k];
            }
            return "";
          };

          const invNum = String(findVal(["invoicenumber", "invoiceno", "invno", "invoice", "number", "ref", "invoiceref"]) || "INV-" + Math.floor(1000 + Math.random() * 9000)).trim();
          let rawDate = findVal(["invoicedate", "date", "issuedon", "issuedate"]);
          if (rawDate instanceof Date) {
            rawDate = rawDate.toISOString().slice(0, 10);
          } else if (typeof rawDate === "string") {
            const parts = rawDate.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
            if (parts) {
              rawDate = `${parts[3]}-${parts[2].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
            }
          }
          const invDate = String(rawDate || new Date().toISOString().slice(0, 10)).trim();

          let rawDue = findVal(["duedate", "dueon", "due"]);
          if (rawDue instanceof Date) rawDue = rawDue.toISOString().slice(0, 10);
          const dueDate = String(rawDue || invDate).trim();

          const supplier = String(findVal(["supplier", "suppliername", "vendor", "vendorname", "seller"]) || "General Supplier").trim();
          const customer = String(findVal(["customer", "customername", "client", "billto"]) || selectedCompany.name).trim();
          const desc = String(findVal(["description", "item", "itemdescription", "product", "details"]) || "Goods / Services").trim();

          const qty = Number(findVal(["qty", "quantity", "units"])) || 1;
          const rate = Number(findVal(["rate", "unitprice", "price", "unitrate"])) || 0;
          const vatPct = Number(findVal(["vatrate", "vat", "vatpercent", "taxrate", "vatpct"])) || 0;
          const rawAmount = Number(findVal(["amount", "netamount", "linetotal", "total", "subtotal"])) || (qty * rate);

          const purposeRaw = String(findVal(["purpose", "module", "route"])).toLowerCase().trim();
          const rowPurpose: InvoicePurpose = (purposeRaw === "ors" || purposeRaw === "vat" || purposeRaw === "both") ? purposeRaw : defaultPurpose;

          const rawPdfLink = String(findVal([
            "invoicepdflink",
            "pdflink",
            "pdfurl",
            "invoicelink",
            "documentlink",
            "documenturl",
            "pdf",
            "filelink",
            "link",
            "attachmentlink",
            "attachment",
            "url",
            "downloadurl"
          ]) || "").trim();

          return {
            invoiceNumber: invNum,
            invoiceDate: invDate,
            dueDate,
            supplierName: supplier,
            customerName: customer,
            description: desc,
            quantity: qty > 0 ? qty : 1,
            unitPrice: rate > 0 ? rate : rawAmount / (qty > 0 ? qty : 1),
            vatRate: vatPct >= 0 ? vatPct : 0,
            netAmount: rawAmount > 0 ? rawAmount : (qty * rate),
            currency: String(findVal(["currency", "curr"]) || selectedCompany.currency || "GBP").toUpperCase(),
            direction: String(findVal(["direction", "type"])).toLowerCase().includes("sale") ? "Sale" : "Purchase",
            purpose: rowPurpose,
            pdfLink: rawPdfLink || undefined,
          };
        });

        // Group rows into invoices by invoiceNumber
        const groups: Record<string, GroupedInvoice> = {};
        for (const row of parsedRows) {
          if (!groups[row.invoiceNumber]) {
            groups[row.invoiceNumber] = {
              invoiceNumber: row.invoiceNumber,
              invoiceDate: row.invoiceDate,
              dueDate: row.dueDate,
              supplierName: row.supplierName,
              customerName: row.customerName || selectedCompany.name,
              currency: (["GBP", "EUR", "USD"].includes(row.currency) ? row.currency : selectedCompany.currency) as any,
              direction: row.direction,
              purpose: row.purpose,
              pdfLink: row.pdfLink || "",
              lines: [],
              subtotal: 0,
              vatAmount: 0,
              totalAmount: 0,
              isValid: true,
              errors: []
            };
          } else if (!groups[row.invoiceNumber].pdfLink && row.pdfLink) {
            groups[row.invoiceNumber].pdfLink = row.pdfLink;
          }

          const line = calculateLine({
            description: row.description,
            quantity: row.quantity,
            unitPrice: row.unitPrice,
            discount: 0,
            vatRate: row.vatRate
          });
          groups[row.invoiceNumber].lines.push(line);
        }

        // Calculate totals for each grouped invoice
        const invoiceList = Object.values(groups).map((inv) => {
          const totals = calculateInvoiceTotals(inv.lines);
          const errors: string[] = [];
          if (!inv.invoiceNumber) errors.push("Missing invoice number");
          if (!inv.supplierName) errors.push("Missing supplier name");
          if (totals.totalAmount <= 0) errors.push("Total amount must be greater than 0");

          return {
            ...inv,
            subtotal: totals.subtotal,
            vatAmount: totals.vatAmount,
            totalAmount: totals.totalAmount,
            isValid: errors.length === 0,
            errors
          };
        });

        setGroupedInvoices(invoiceList);
        showToast({
          title: "Spreadsheet Parsed",
          description: `Loaded ${invoiceList.length} invoices with ${parsedRows.length} line items.`,
          tone: "success"
        });
      } catch (err: any) {
        showToast({ title: "Parse Error", description: err.message || "Could not read spreadsheet file.", tone: "info" });
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleDownloadTemplate = () => {
    const sampleRows = [
      {
        "Invoice Number": "INV-000110",
        "Invoice Date": "2026-10-26",
        "Due Date": "2026-10-26",
        "Supplier Name": "RK FRUITS & VEGETABLES LIMITED",
        "Customer Name": selectedCompany.name || "Mumbai Fusion",
        "Description": "Red onion 10kg",
        "Quantity": 1,
        "Unit Price": 12.00,
        "VAT Rate": 0,
        "Line Total": 12.00,
        "Currency": "GBP",
        "Direction": "Purchase",
        "Purpose": "both",
        "Invoice PDF Link": "https://example.com/invoices/INV-000110.pdf"
      },
      {
        "Invoice Number": "INV-000110",
        "Invoice Date": "2026-10-26",
        "Due Date": "2026-10-26",
        "Supplier Name": "RK FRUITS & VEGETABLES LIMITED",
        "Customer Name": selectedCompany.name || "Mumbai Fusion",
        "Description": "Onions -20kg",
        "Quantity": 1,
        "Unit Price": 15.00,
        "VAT Rate": 0,
        "Line Total": 15.00,
        "Currency": "GBP",
        "Direction": "Purchase",
        "Purpose": "both",
        "Invoice PDF Link": "https://example.com/invoices/INV-000110.pdf"
      },
      {
        "Invoice Number": "INV-000110",
        "Invoice Date": "2026-10-26",
        "Due Date": "2026-10-26",
        "Supplier Name": "RK FRUITS & VEGETABLES LIMITED",
        "Customer Name": selectedCompany.name || "Mumbai Fusion",
        "Description": "Button mushroom",
        "Quantity": 1,
        "Unit Price": 9.00,
        "VAT Rate": 0,
        "Line Total": 9.00,
        "Currency": "GBP",
        "Direction": "Purchase",
        "Purpose": "both",
        "Invoice PDF Link": "https://example.com/invoices/INV-000110.pdf"
      },
      {
        "Invoice Number": "INV-000110",
        "Invoice Date": "2026-10-26",
        "Due Date": "2026-10-26",
        "Supplier Name": "RK FRUITS & VEGETABLES LIMITED",
        "Customer Name": selectedCompany.name || "Mumbai Fusion",
        "Description": "Peeld garlic Box",
        "Quantity": 1,
        "Unit Price": 45.00,
        "VAT Rate": 0,
        "Line Total": 45.00,
        "Currency": "GBP",
        "Direction": "Purchase",
        "Purpose": "both",
        "Invoice PDF Link": "https://example.com/invoices/INV-000110.pdf"
      },
      {
        "Invoice Number": "INV-000111",
        "Invoice Date": "2026-11-01",
        "Due Date": "2026-11-30",
        "Supplier Name": "Northbridge Office Supplies Ltd",
        "Customer Name": selectedCompany.name,
        "Description": "A4 Copy Paper Box 5 Reams",
        "Quantity": 5,
        "Unit Price": 22.50,
        "VAT Rate": 20,
        "Line Total": 112.50,
        "Currency": "GBP",
        "Direction": "Purchase",
        "Purpose": "both",
        "Invoice PDF Link": "https://example.com/invoices/INV-000111.pdf"
      }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Invoices Template");
    XLSX.writeFile(ukWorkbook(wb), "vetthevat_invoice_import_template.xlsx");
  };

  const handleConfirmImport = async () => {
    if (!groupedInvoices.length) return;
    setIsProcessing(true);
    let importedCount = 0;

    try {
      for (const item of groupedInvoices) {
        if (!item.isValid) continue;

        // Auto-create or resolve supplier
        let supplierId = "";
        const existingSupplier = suppliers.find(
          (s) => s.name.trim().toLowerCase() === item.supplierName.trim().toLowerCase()
        );

        if (existingSupplier) {
          supplierId = existingSupplier.id;
        } else {
          supplierId = `supplier-${crypto.randomUUID()}`;
          const newSupplier: Supplier = {
            id: supplierId,
            companyId: selectedCompany.id,
            name: item.supplierName.trim(),
            vatNumber: "",
            phone: "",
            email: `${item.supplierName.toLowerCase().replace(/[^a-z0-9]/g, "")}@example.com`,
            address: "",
            status: "Active"
          };
          saveSupplier(newSupplier);
        }

        const invoiceId = `invoice-${crypto.randomUUID()}`;

        // Create and associate stored document if PDF link provided
        let documentId = "";
        if (item.pdfLink && item.pdfLink.trim()) {
          documentId = `doc-${crypto.randomUUID()}`;
          const trimmedUrl = item.pdfLink.trim();
          const rawFileName = trimmedUrl.split("/").pop()?.split("?")[0] || `${item.invoiceNumber}.pdf`;
          const docFileName = rawFileName.toLowerCase().endsWith(".pdf") ? rawFileName : `${rawFileName}.pdf`;
          addDocument({
            id: documentId,
            companyId: selectedCompany.id,
            fileName: docFileName,
            fileType: "PDF",
            mimeType: "application/pdf",
            sizeLabel: "External PDF",
            previewUrl: trimmedUrl,
            secureUrl: trimmedUrl,
            localPreviewUrl: trimmedUrl,
            uploadedAt: new Date().toISOString(),
            status: "Processed",
            associatedInvoiceId: invoiceId,
            associatedSupplierId: supplierId
          });
        }

        const newInvoice: Invoice = {
          id: invoiceId,
          companyId: selectedCompany.id,
          supplierId,
          documentId,
          supplierName: item.supplierName,
          supplierVatNumber: "",
          customerName: item.customerName,
          customerVatNumber: selectedCompany.vatNumber || "",
          invoiceNumber: item.invoiceNumber,
          invoiceDate: item.invoiceDate,
          dueDate: item.dueDate,
          currency: item.currency,
          subtotal: item.subtotal,
          vatAmount: item.vatAmount,
          totalAmount: item.totalAmount,
          vatBreakdown: buildVATBreakdown(item.lines),
          lineItems: item.lines,
          status: "Reviewed",
          processingStatus: "Confirmed",
          reviewStatus: "Reviewed",
          confidence: "High",
          warnings: [],
          activity: [],
          notes: `Imported via Excel (${fileName})${item.pdfLink ? ` · PDF: ${item.pdfLink}` : ""} · Purpose: ${item.purpose.toUpperCase()}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        saveInvoice(newInvoice);

        // If purpose is ORS or Both, dispatch to ORS supplier invoices
        if (item.purpose === "ors" || item.purpose === "both") {
          try {
            await fetch("/api/ors/supplier-invoices", {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-company-id": selectedCompany.id
              },
              body: JSON.stringify({
                invoiceNumber: item.invoiceNumber,
                supplier: item.supplierName,
                invoiceDate: item.invoiceDate,
                dueDate: item.dueDate,
                currency: item.currency,
                subtotal: item.subtotal,
                vat: item.vatAmount,
                total: item.totalAmount,
                documentId: documentId || undefined,
                pdfUrl: item.pdfLink || undefined,
                lines: item.lines.map((l) => ({
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

        importedCount++;
      }

      setImportStatus(`Successfully imported ${importedCount} invoice(s) into ${selectedCompany.name}.`);
      showToast({
        title: "Import Completed",
        description: `Successfully imported ${importedCount} invoice(s).`,
        tone: "success"
      });

      if (onComplete) {
        setTimeout(onComplete, 1200);
      }
    } catch (err: any) {
      showToast({ title: "Import Error", description: err.message || "Failed saving records.", tone: "info" });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <FileSpreadsheet className="h-6 w-6 text-brand-700" />
            Import Invoices from Excel / CSV
          </h2>
          <p className="mt-1 text-sm text-muted">
            Upload XLSX, XLS, or CSV files with multi-line invoices, suppliers and tax details.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="text-xs h-9 px-3" onClick={handleDownloadTemplate}>
            <Download className="mr-1.5 h-4 w-4" />
            Download Sample Template (.xlsx)
          </Button>
          {onClose ? (
            <Button variant="ghost" className="text-xs h-9 px-3" onClick={onClose}>
              Cancel
            </Button>
          ) : null}
        </div>
      </div>

      {/* Purpose Selection */}
      <div className="mt-5 rounded-lg border border-line bg-wash p-4">
        <label className="text-xs font-bold uppercase tracking-wider text-muted">Default Invoice Routing Purpose</label>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setDefaultPurpose("vat")}
            className={`rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
              defaultPurpose === "vat" ? "bg-brand-700 text-white shadow-xs" : "border border-line bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            Use for VAT Only
          </button>
          <button
            type="button"
            onClick={() => setDefaultPurpose("ors")}
            className={`rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
              defaultPurpose === "ors" ? "bg-brand-700 text-white shadow-xs" : "border border-line bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            Use for ORS Only
          </button>
          <button
            type="button"
            onClick={() => setDefaultPurpose("both")}
            className={`rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
              defaultPurpose === "both" ? "bg-brand-700 text-white shadow-xs" : "border border-line bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            Use for Both (VAT &amp; ORS)
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">
          {defaultPurpose === "both"
            ? "Invoices will be recorded in VAT returns and will automatically populate ORS supplier invoices for ordering and material tracking."
            : defaultPurpose === "ors"
            ? "Invoices will be sent directly to the ORS platform for PO and stock matching."
            : "Invoices will be recorded in standard VAT management records."}
        </p>
      </div>

      {/* PDF Linking Guidance */}
      <div className="mt-4 flex items-center gap-2.5 rounded-lg bg-blue-50/70 border border-blue-200 p-3 text-xs text-blue-900">
        <LinkIcon className="h-4 w-4 shrink-0 text-blue-600" />
        <span>
          <strong>Invoice PDF Linking Supported:</strong> Include an <code>Invoice PDF Link</code> column in your Excel/CSV spreadsheet with web or document URLs to automatically attach and link original PDFs to each imported invoice.
        </span>
      </div>

      {/* File Upload Dropzone */}
      <div className="mt-5">
        <label
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) handleFileUpload(f);
          }}
          onDragOver={(e) => e.preventDefault()}
          className="grid min-h-[160px] cursor-pointer place-items-center rounded-xl border-2 border-dashed border-line bg-wash p-6 text-center hover:border-brand-500 transition-colors"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFileUpload(f);
              e.target.value = "";
            }}
          />
          <div>
            <Upload className="mx-auto h-8 w-8 text-brand-700" />
            <span className="mt-3 block text-base font-semibold">
              {fileName ? fileName : "Click to browse or drop Excel / CSV spreadsheet here"}
            </span>
            <span className="mt-1 block text-xs text-muted">Supports .xlsx, .xls, and .csv formats up to 20MB</span>
          </div>
        </label>
      </div>

      {/* Grouped Invoices Preview */}
      {groupedInvoices.length > 0 ? (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-bold">
              Parsed Invoices ({groupedInvoices.length})
            </h3>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="text-xs h-9 px-3"
                onClick={() => {
                  setGroupedInvoices([]);
                  setFileName("");
                }}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Clear
              </Button>
              <Button
                className="text-xs h-9 px-3"
                disabled={isProcessing || !groupedInvoices.some((i) => i.isValid)}
                onClick={handleConfirmImport}
              >
                Confirm &amp; Import All Invoices
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-line bg-wash/60 text-muted uppercase tracking-wider font-semibold">
                <tr>
                  <th className="p-3">Status</th>
                  <th className="p-3">Invoice #</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Supplier</th>
                  <th className="p-3">Items</th>
                  <th className="p-3">Purpose</th>
                  <th className="p-3">Invoice PDF Link</th>
                  <th className="p-3">Subtotal</th>
                  <th className="p-3">VAT</th>
                  <th className="p-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {groupedInvoices.map((inv) => (
                  <tr key={inv.invoiceNumber} className="hover:bg-slate-50/50">
                    <td className="p-3">
                      {inv.isValid ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                          <CheckCircle2 className="h-4 w-4" /> Ready
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-semibold text-red-600" title={inv.errors.join(", ")}>
                          <AlertCircle className="h-4 w-4" /> Issues
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-bold">{inv.invoiceNumber}</td>
                    <td className="p-3 text-muted">{ukDate(inv.invoiceDate)}</td>
                    <td className="p-3 font-semibold">{inv.supplierName}</td>
                    <td className="p-3">
                      <span className="rounded bg-wash px-2 py-0.5 font-medium">{inv.lines.length} item(s)</span>
                    </td>
                    <td className="p-3">
                      <Badge tone={inv.purpose === "both" ? "blue" : inv.purpose === "ors" ? "green" : "grey"}>
                        {inv.purpose === "both" ? "VAT + ORS" : inv.purpose.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="p-3">
                      {inv.pdfLink ? (
                        <a
                          href={inv.pdfLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:text-brand-900 underline max-w-[170px] truncate"
                          title={inv.pdfLink}
                        >
                          <FileText className="h-3.5 w-3.5 shrink-0 text-red-600" />
                          <span className="truncate">{inv.pdfLink.split("/").pop() || "View PDF"}</span>
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      ) : (
                        <input
                          type="url"
                          placeholder="Paste PDF link..."
                          className="field-control text-xs h-7 py-0 px-2 max-w-[150px]"
                          value={inv.pdfLink || ""}
                          onChange={(e) => {
                            const val = e.target.value.trim();
                            setGroupedInvoices((prev) =>
                              prev.map((g) => (g.invoiceNumber === inv.invoiceNumber ? { ...g, pdfLink: val } : g))
                            );
                          }}
                        />
                      )}
                    </td>
                    <td className="p-3">{formatCurrency(inv.subtotal, inv.currency)}</td>
                    <td className="p-3">{formatCurrency(inv.vatAmount, inv.currency)}</td>
                    <td className="p-3 text-right font-bold text-ink">{formatCurrency(inv.totalAmount, inv.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {importStatus ? (
        <div role="status" className="mt-4 rounded-lg bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
          {importStatus}
        </div>
      ) : null}
    </Card>
  );
}
