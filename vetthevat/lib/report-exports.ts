"use client";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";
import type { Company, Invoice, StoredDocument } from "@/lib/domain";
import { buildReport, type ReportFilters } from "@/lib/reporting";

export function createReportWorkbook(invoices: Invoice[], documents: StoredDocument[], company: Company, filters: ReportFilters = { approval: "Reviewed" }, origin = "") {
  const report = buildReport(invoices, documents, company, filters);
  if (!report.rows.length) throw new Error("No invoices match the export filters.");
  const workbook = XLSX.utils.book_new();
  workbook.Props = { Title: "VET THE VAT Report", Company: company.name, Subject: "Local invoice records" };
  const invoiceRows = report.rows.map((invoice) => {
    const original = documents.find((document) => document.id === invoice.documentId);
    const pdfLink = original?.previewUrl || original?.secureUrl || original?.localPreviewUrl || (invoice.documentId ? `${origin}/api/business/documents/${encodeURIComponent(invoice.documentId)}/review` : "");
    return {
      "Record ID": invoice.id,
      "Company ID": invoice.companyId,
      "Customer ID": invoice.customerId ?? "",
      "Invoice Number": invoice.invoiceNumber || "Untitled draft",
      Supplier: invoice.supplierName,
      "Supplier VAT Number": invoice.supplierVatNumber,
      "Invoice Date": invoice.invoiceDate,
      "Due Date": invoice.dueDate,
      Customer: invoice.customerName,
      "Customer VAT Number": invoice.customerVatNumber,
      Currency: invoice.currency,
      "Net Amount": invoice.subtotal,
      "VAT Amount": invoice.vatAmount,
      "Gross Amount": invoice.totalAmount,
      Status: invoice.status,
      Approval: invoice.reviewStatus,
      Notes: invoice.notes ?? "",
      "Original availability": original?.localPreviewUrl ? "Upload session only" : original ? "Metadata only; original unavailable" : "No document attached",
      "Invoice PDF Link": pdfLink ? { t: "s", v: pdfLink, l: { Target: pdfLink, Tooltip: "Open Invoice PDF Document" } } : "No PDF link",
      "Invoice record": { t: "s", v: "View record", l: { Target: `${origin}/app/invoices/${encodeURIComponent(invoice.id)}`, Tooltip: "Local record; original file is not permanently stored" } }
    };
  });
  const transactions = XLSX.utils.json_to_sheet(invoiceRows);
  transactions["!autofilter"] = { ref: transactions["!ref"]! };
  transactions["!cols"] = Object.keys(invoiceRows[0]).map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(workbook, transactions, "VAT Transactions");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(report.rows.flatMap((invoice) => invoice.lineItems.map((line) => ({ "Record ID": invoice.id, "Invoice Number": invoice.invoiceNumber, Currency: invoice.currency, Description: line.description, "Tax Classification":line.taxClassification||"Unclassified", "Transaction Type":invoice.transactionType||"Unclassified", Quantity: line.quantity, "Unit Price": line.unitPrice, Discount: line.discount, "VAT Rate": line.vatRate, "Net Amount": line.netAmount, "VAT Amount": line.vatAmount, "Gross Amount": line.grossAmount })))), "Invoice Line Items");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(report.rows.flatMap((invoice) => invoice.vatBreakdown.map((vat) => ({ "Record ID": invoice.id, "Invoice Number": invoice.invoiceNumber, Currency: invoice.currency, "VAT Rate": vat.rate, "Net Amount": vat.netAmount, "VAT Amount": vat.vatAmount, "Gross Amount": vat.grossAmount })))), "VAT Breakdown");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(report.currencies.map((total) => ({ Company: company.name, Period: report.period, Currency: total.currency, "Invoice Count": total.count, "Net Amount": total.net, "VAT Amount": total.vat, "Gross Amount": total.gross, Approval: filters.approval ?? "All" }))), "VAT Summary");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(report.suppliers.map((total) => ({ Supplier: total.name, Currency: total.currency, "Invoice Count": total.count, "Net Amount": total.net, "VAT Amount": total.vat, "Gross Amount": total.gross }))), "Supplier Summary");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(report.monthly.map((total) => ({ Month: total.month, Currency: total.currency, "Invoice Count": total.count, "Net Amount": total.net, "VAT Amount": total.vat, "Gross Amount": total.gross }))), "Monthly Summary");
  return workbook;
}

export function createReportPdf(invoices: Invoice[], company: Company, filters: ReportFilters = {}, documents: StoredDocument[] = []) {
  const report = buildReport(invoices, documents, company, filters);
  if (!report.rows.length) throw new Error("No invoices match the export filters.");
  const doc = new jsPDF({ orientation: "landscape" });
  let y = 0;
  function pageTitle() {
    doc.setFontSize(17); doc.setFont("helvetica", "bold"); doc.text("VET THE VAT", 14, 16);
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.text(`Company: ${company.name.slice(0, 100)}`, 14, 24);
    doc.text(`Period: ${report.period} | Approval: ${filters.approval ?? "All"} | Status: ${filters.status ?? "All"}`, 14, 31);
    doc.text(`Invoices: ${report.rows.length} | Generated: ${new Date().toISOString().slice(0, 10)} | Local workspace records`, 14, 38);
    y = 48;
  }
  function ensure(height: number) { if (y + height > 185) { doc.addPage(); pageTitle(); } }
  pageTitle();
  for (const total of report.currencies) { ensure(10); doc.text(`${total.currency}: Net ${total.net.toFixed(2)} | VAT ${total.vat.toFixed(2)} | Gross ${total.gross.toFixed(2)} | ${total.count} invoices`, 14, y); y += 8; }
  y += 6;
  for (const invoice of report.rows) {
    const number = doc.splitTextToSize(invoice.invoiceNumber || "Untitled draft", 35) as string[];
    const supplier = doc.splitTextToSize((invoice.transactionType==="Sale"?invoice.customerName:invoice.supplierName) || "Unassigned counterparty", 65) as string[];
    const height = Math.max(number.length, supplier.length) * 5 + 8;
    ensure(height);
    doc.setFontSize(9); doc.text(number, 14, y); doc.text(supplier, 52, y); doc.text(invoice.invoiceDate || "No date", 122, y);
    doc.text(invoice.currency, 151, y); doc.text(invoice.subtotal.toFixed(2), 171, y); doc.text(invoice.vatAmount.toFixed(2), 202, y); doc.text(invoice.totalAmount.toFixed(2), 232, y);
    doc.setFontSize(8); doc.text(`Net / VAT / Gross | ${invoice.status} | ${invoice.reviewStatus}`, 151, y + 5); y += height;
  }
  const pages = doc.getNumberOfPages();
  for (let index = 1; index <= pages; index++) { doc.setPage(index); doc.setFontSize(8); doc.text(`Local report; review before accounting use. Page ${index} of ${pages}`, 14, 200); }
  return doc;
}

export const browserReportExportService = {
  exportExcel(invoices: Invoice[], documents: StoredDocument[], company: Company, filters: ReportFilters = { approval: "Reviewed" }) {
    const workbook = createReportWorkbook(invoices, documents, company, filters, window.location.origin);
    XLSX.writeFile(workbook, "vet-the-vat-invoices.xlsx");
  },
  exportPdf(invoices: Invoice[], company: Company, filters: ReportFilters = {}, documents: StoredDocument[] = []) {
    createReportPdf(invoices, company, filters, documents).save(`vet-the-vat-report-${new Date().toISOString().slice(0, 10)}.pdf`);
  }
};

