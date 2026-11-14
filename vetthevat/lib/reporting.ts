import type { Company, Invoice, StoredDocument } from "@/lib/domain";
import { filterInvoices, type LocalInvoiceFilters } from "@/lib/invoice-filters";
import { fromMinorUnits, toMinorUnits } from "@/lib/money";
import { parseInvoiceDate } from "@/lib/invoice-rules";

export type ReportFilters = Partial<Omit<LocalInvoiceFilters, "companyId">> & { approval?: "All" | "Reviewed" | "Needs Review"; vatRate?: string };
export type Totals = { count: number; net: number; vat: number; gross: number };
export function sumRecords(invoices: Invoice[]): Totals {
  const sums = invoices.reduce((total, invoice) => ({ net: total.net + toMinorUnits(invoice.subtotal), vat: total.vat + toMinorUnits(invoice.vatAmount), gross: total.gross + toMinorUnits(invoice.totalAmount) }), { net: 0, vat: 0, gross: 0 });
  return { count: invoices.length, net: fromMinorUnits(sums.net), vat: fromMinorUnits(sums.vat), gross: fromMinorUnits(sums.gross) };
}
export function groupCurrencies(invoices: Invoice[]) {
  return [...new Set(invoices.map((invoice) => invoice.currency))].sort().map((currency) => ({ currency, ...sumRecords(invoices.filter((invoice) => invoice.currency === currency)) }));
}
export function buildReport(invoices: Invoice[], documents: StoredDocument[], company: Company, filters: ReportFilters = {}) {
  if (filters.vatRate && filters.vatRate !== "All" && (!Number.isFinite(Number(filters.vatRate)) || Number(filters.vatRate)<0)) throw new Error("Choose a valid VAT rate.");
  if (filters.dateFrom && !parseInvoiceDate(filters.dateFrom) || filters.dateTo && !parseInvoiceDate(filters.dateTo)) throw new Error("Enter valid reporting dates.");
  filters = { ...filters, dateFrom: filters.dateFrom ? parseInvoiceDate(filters.dateFrom)! : undefined, dateTo: filters.dateTo ? parseInvoiceDate(filters.dateTo)! : undefined };
  if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) throw new Error("Start date must be on or before end date.");
  const eligible = filterInvoices(invoices, { ...filters, companyId: company.id }, documents).filter((invoice) => filters.approval === "Reviewed" ? invoice.reviewStatus === "Reviewed" && invoice.processingStatus === "Confirmed" : filters.approval === "Needs Review" ? invoice.reviewStatus === "Needs Review" : true).sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate) || a.invoiceNumber.localeCompare(b.invoiceNumber));
  const rows = filters.vatRate && filters.vatRate !== "All" ? eligible.filter(invoice=>invoice.vatBreakdown.some(vat=>vat.rate===Number(filters.vatRate))) : eligible;
  const currencies = groupCurrencies(rows);
  const monthly = [...new Set(rows.filter((invoice) => invoice.invoiceDate).map((invoice) => invoice.invoiceDate.slice(0, 7)))].sort().flatMap((month) => groupCurrencies(rows.filter((invoice) => invoice.invoiceDate.startsWith(month))).map((totals) => ({ month, ...totals })));
  const suppliers = [...new Set(rows.map((invoice) => invoice.supplierId || invoice.supplierName))].flatMap((supplierKey) => {
    const supplierInvoices = rows.filter((invoice) => (invoice.supplierId || invoice.supplierName) === supplierKey);
    return groupCurrencies(supplierInvoices).map((totals) => ({ supplierKey, name: supplierInvoices[0].supplierName || "Unassigned", ...totals }));
  });
  const statuses = [...new Set(rows.map((invoice) => invoice.status))].map((status) => ({ status, count: rows.filter((invoice) => invoice.status === status).length }));
  const period = `${filters.dateFrom || "All dates"} to ${filters.dateTo || "latest"}`;
  return { rows, currencies, monthly, suppliers, statuses, period, company, filters };
}

