"use client";
// Import a bank statement (CSV / Excel), match money paid out to the company's
// saved purchase invoices, show the VAT in each payment, and export the result
// for the accountant. The statement file is read on this device only.
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import Link from "next/link";
import { CheckCircle2, Download, FileSpreadsheet, HelpCircle, Upload, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { matchSummary, matchTransactions, parseStatementRows, type MatchedTransaction, type PayableInvoice } from "@/lib/bank-matching";

const money = (value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
const ukDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
type Filter = "All" | "Matched" | "Possible match" | "No invoice";

export function BankPaymentMatching({ companyId, companyName }: { companyId: string; companyName?: string }) {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<MatchedTransaction[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>("All");

  async function importFile(file: File | undefined) {
    if (!file) return;
    setError(""); setNotice(""); setBusy(true);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Choose a statement file no larger than 5 MB.");
      if (!/\.(csv|xlsx|xls)$/i.test(file.name)) throw new Error("Choose a CSV or Excel (.xlsx / .xls) bank statement.");
      const book = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false, raw: false });
      const sheet = book.Sheets[book.SheetNames[0]];
      const table = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" });
      const parsed = parseStatementRows(table);
      if (parsed.error) throw new Error(parsed.error);
      if (!parsed.transactions.length) throw new Error("No transactions with a date and amount were found in this file.");
      const response = await fetch("/api/business/payable-invoices", { headers: { "x-company-id": companyId }, cache: "no-store", signal: AbortSignal.timeout(30000) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message ?? "Your purchase invoices could not be loaded.");
      const matched = matchTransactions(parsed.transactions, body.data.items as PayableInvoice[]);
      setRows(matched); setFileName(file.name); setFilter("All");
      setNotice(`${parsed.transactions.length} transactions read${parsed.skipped ? `, ${parsed.skipped} rows without a date or amount skipped` : ""}.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The statement could not be read."); }
    finally { setBusy(false); }
  }

  const summary = useMemo(() => matchSummary(rows), [rows]);
  const visible = rows.filter(row => row.direction === "out" && (filter === "All" || row.status === filter));
  const setStatus = (id: string, status: "Matched" | "No invoice") => setRows(old => old.map(row => row.id !== id ? row : status === "Matched"
    ? { ...row, status, reason: "Confirmed by you" } : { ...row, status, invoice: null, reason: "Rejected by you" }));

  function exportForAccountant() {
    const data = rows.filter(row => row.direction === "out").map(row => ({
      Date: row.date, "Bank description": row.description, "Paid out": row.amount, Status: row.status,
      Supplier: row.invoice?.supplierName ?? "", "Invoice number": row.invoice?.number ?? "", "Invoice date": row.invoice?.issuedOn ?? "",
      Net: row.invoice?.net ?? "", VAT: row.invoice?.vat ?? "", Gross: row.invoice?.gross ?? "", Note: row.reason
    }));
    const book = XLSX.utils.book_new(), sheet = XLSX.utils.json_to_sheet(data);
    sheet["!cols"] = [{ wch: 11 }, { wch: 34 }, { wch: 10 }, { wch: 15 }, { wch: 30 }, { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(book, sheet, "Payments");
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([
      { Item: "Company", Value: companyName ?? "" }, { Item: "Statement", Value: fileName }, { Item: "Payments out", Value: summary.paymentsOut },
      { Item: "Matched to invoice", Value: summary.matched }, { Item: "Possible matches (confirm)", Value: summary.possible }, { Item: "No invoice found", Value: summary.missing },
      { Item: "Total paid out", Value: summary.paidOut }, { Item: "VAT on matched invoices", Value: summary.vatEvidenced }, { Item: "VAT on possible matches", Value: summary.vatToConfirm }, { Item: "Paid out with no invoice", Value: summary.unmatchedAmount }
    ]), "Summary");
    XLSX.writeFile(book, `bank-vat-matching-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return <div className="grid min-w-0 grid-cols-1 gap-5">
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-xl font-bold">Bank statement VAT matching</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">Import the statement exported from your bank (CSV or Excel). Each payment out is matched to a saved purchase invoice so you can see the VAT in it, and find payments with no invoice.</p></div>
        <div className="flex flex-wrap gap-2">
          <label className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md bg-brand-700 px-4 text-sm font-semibold text-white ${busy ? "opacity-60" : ""}`}><Upload className="h-4 w-4" />{busy ? "Reading…" : "Import statement"}
            <input type="file" accept=".csv,.xlsx,.xls" className="sr-only" disabled={busy} onChange={e => { void importFile(e.currentTarget.files?.[0]); e.currentTarget.value = ""; }} /></label>
          {rows.length ? <Button type="button" variant="outline" onClick={exportForAccountant}><Download className="h-4 w-4" />Export for accountant</Button> : null}
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">Columns needed: Date and either Amount (payments negative) or Paid out / Paid in. The file stays on this device.</p>
      {error ? <p role="alert" className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      {notice ? <p role="status" className="mt-3 rounded-md bg-brand-50 p-3 text-sm text-brand-800"><FileSpreadsheet className="mr-1 inline h-4 w-4" />{fileName}: {notice}</p> : null}
    </Card>

    {rows.length ? <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([["Paid out", money(summary.paidOut), `${summary.paymentsOut} payments`], ["VAT matched", money(summary.vatEvidenced), `${summary.matched} payments with an invoice`],
          ["To confirm", money(summary.vatToConfirm), `${summary.possible} possible matches`], ["No invoice", money(summary.unmatchedAmount), `${summary.missing} payments — find the receipt`]] as const)
          .map(([label, value, hint]) => <Card key={label} className="p-4"><p className="text-xs font-semibold text-muted">{label}</p><p className="mt-1 text-xl font-bold tabular-nums">{value}</p><p className="text-xs text-muted">{hint}</p></Card>)}
      </div>
      <Card className="min-w-0 p-5">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter payments">
          {(["All", "Matched", "Possible match", "No invoice"] as Filter[]).map(value => <button key={value} type="button" role="tab" aria-selected={filter === value} onClick={() => setFilter(value)}
            className={`min-h-9 rounded-full px-3 text-xs font-semibold ${filter === value ? "bg-brand-700 text-white" : "bg-wash text-muted"}`}>{value}</button>)}
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs text-muted"><tr><th className="py-2">Date</th><th>Bank description</th><th className="text-right">Paid out</th><th className="pl-4">Invoice</th><th className="text-right">VAT</th><th className="pl-4">Status</th></tr></thead>
            <tbody>{visible.map(row => <tr key={row.id} className="border-t border-line align-top">
              <td className="py-3 whitespace-nowrap">{ukDate(row.date)}</td>
              <td className="py-3 pr-3">{row.description || "—"}</td>
              <td className="py-3 text-right font-semibold tabular-nums">{money(row.amount)}</td>
              <td className="py-3 pl-4">{row.invoice ? <><Link href={`/app/invoices/${row.invoice.id}`} className="font-semibold text-brand-700 underline">{row.invoice.number}</Link><span className="block text-xs text-muted">{row.invoice.supplierName} · {ukDate(row.invoice.issuedOn)}</span></> : <span className="text-muted">—</span>}</td>
              <td className="py-3 text-right tabular-nums">{row.invoice ? money(row.invoice.vat) : "—"}</td>
              <td className="py-3 pl-4">
                {row.status === "Matched" ? <span className="inline-flex items-center gap-1 font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" />Matched</span>
                  : row.status === "Possible match" ? <span className="inline-flex items-center gap-1 font-semibold text-amber-700"><HelpCircle className="h-4 w-4" />Possible match</span>
                  : <span className="inline-flex items-center gap-1 font-semibold text-red-700"><XCircle className="h-4 w-4" />No invoice</span>}
                <span className="block text-xs text-muted">{row.reason}</span>
                {row.status === "Possible match" ? <span className="mt-1 flex gap-2"><Button type="button" variant="outline" className="min-h-8 px-2 text-xs" onClick={() => setStatus(row.id, "Matched")}>Confirm</Button><Button type="button" variant="ghost" className="min-h-8 px-2 text-xs" onClick={() => setStatus(row.id, "No invoice")}>Not this</Button></span> : null}
                {row.status === "No invoice" ? <Link href="/app/invoices/upload" className="mt-1 inline-block text-xs font-semibold text-brand-700 underline">Scan the receipt</Link> : null}
              </td></tr>)}</tbody>
          </table>
          {!visible.length ? <p className="py-6 text-center text-sm text-muted">No payments in this view.</p> : null}
        </div>
      </Card>
    </> : null}
  </div>;
}
