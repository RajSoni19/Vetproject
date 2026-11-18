// The Excel file for the accountant: every payment on the statement, with VAT only
// where a person-checked match to a saved invoice exists. Unverified payments are
// still listed, with VAT £0, so nothing is claimed without an invoice behind it.
import * as XLSX from "xlsx";
import { matchSummary, type MatchedTransaction } from "@/lib/bank-matching";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const DATE_FORMAT = "dd/mm/yyyy", MONEY_FORMAT = '"£"#,##0.00';
// Statement text must never run as an Excel formula.
const safeText = (value: string) => /^\s*[=+\-@]/.test(value) ? `'${value}` : value;
const excelDate = (iso: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86400000);
const quarterOf = (month: number) => Math.floor((month - 1) / 3) + 1;
const payments = (rows: readonly MatchedTransaction[]) => rows.filter((row) => row.direction === "out");

export type PeriodOption = { key: string; label: string };
export function periodOptions(rows: readonly MatchedTransaction[]): PeriodOption[] {
  const months = [...new Set(payments(rows).map((row) => row.date.slice(0, 7)))].sort().reverse();
  const quarters = [...new Set(months.map((month) => `${month.slice(0, 4)}-Q${quarterOf(+month.slice(5))}`))].sort().reverse();
  return [{ key: "all", label: "All dates" },
    ...months.map((month) => ({ key: `m:${month}`, label: `${MONTHS[+month.slice(5) - 1]} ${month.slice(0, 4)}` })),
    ...quarters.map((quarter) => { const first = (+quarter.slice(-1) - 1) * 3; return { key: `q:${quarter}`, label: `${MONTHS[first]}–${MONTHS[first + 2]} ${quarter.slice(0, 4)}` }; })];
}

export function rowsInPeriod(rows: readonly MatchedTransaction[], key: string) {
  return payments(rows).filter((row) => key === "all" || (key.startsWith("m:") ? row.date.startsWith(key.slice(2)) : `${row.date.slice(0, 4)}-Q${quarterOf(+row.date.slice(5, 7))}` === key.slice(2)));
}

export const verifiedVat = (row: MatchedTransaction) => row.status === "Matched" && row.invoice ? row.invoice.vat : 0;

export function accountantWorkbook(rows: readonly MatchedTransaction[], details: { company: string; statement: string; period: string; origin: string }) {
  const list = payments(rows);
  const headers = ["Date", "Supplier", "Amount", "Verified", "VAT", "Net", "Invoice number", "Invoice date", "Invoice supplier", "Invoice status", "Invoice PDF", "Note"];
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...list.map((row) => {
    const verified = row.status === "Matched" && row.invoice ? row.invoice : null, vat = verifiedVat(row);
    return [excelDate(row.date), safeText(row.description), row.amount, Boolean(verified), vat, round2(row.amount - vat), safeText(verified?.number ?? ""), verified ? excelDate(verified.issuedOn) : "", safeText(verified?.supplierName ?? ""), verified?.state === "confirmed" ? "Confirmed" : verified ? "Draft" : "", verified ? "Open invoice PDF" : "", verified ? row.reason : `Not verified, no VAT claimed. ${row.reason}`];
  })]);
  list.forEach((row, index) => {
    const excelRow = index + 2;
    sheet[`A${excelRow}`].z = DATE_FORMAT;
    for (const column of ["C", "E", "F"]) sheet[`${column}${excelRow}`].z = MONEY_FORMAT;
    if (sheet[`H${excelRow}`]?.t === "n") sheet[`H${excelRow}`].z = DATE_FORMAT;
    if (row.status === "Matched" && row.invoice && details.origin) sheet[`K${excelRow}`].l = { Target: `${details.origin.replace(/\/+$/, "")}/app/invoices/${encodeURIComponent(row.invoice.id)}?pdf=1`, Tooltip: "Open the invoice PDF (sign in to VET THE VAT)" };
  });
  sheet["!cols"] = [11, 32, 11, 9, 10, 11, 18, 12, 30, 11, 16, 46].map((wch) => ({ wch }));
  sheet["!autofilter"] = { ref: `A1:L${list.length + 1}` };
  const summary = matchSummary(list), vat = round2(list.reduce((sum, row) => sum + verifiedVat(row), 0));
  const notes = XLSX.utils.aoa_to_sheet([
    ["Company", safeText(details.company)], ["Statement", safeText(details.statement)], ["Period", details.period],
    ["Payments", summary.paymentsOut], ["Verified", summary.matched], ["Not verified (no VAT claimed)", summary.possible + summary.missing],
    ["Total paid", summary.paidOut], ["VAT to claim", vat], ["Net of VAT", round2(summary.paidOut - vat)]
  ]);
  for (const cell of ["B7", "B8", "B9"]) notes[cell].z = MONEY_FORMAT;
  notes["!cols"] = [{ wch: 30 }, { wch: 34 }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Bank VAT");
  XLSX.utils.book_append_sheet(book, notes, "Summary");
  return book;
}
