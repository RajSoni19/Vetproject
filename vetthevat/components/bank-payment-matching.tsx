"use client";
// 1. Import the accountant's statement (Supplier, Amount, Date) or a bank export.
// 2. Each payment is matched by amount to a saved purchase invoice, bringing its VAT.
// 3. Verify anything uncertain, then export Excel for the accountant. Unverified
// payments go with VAT £0. The statement is read and kept in this browser only.
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import Link from "next/link";
import { CheckCircle2, Download, FileSpreadsheet, HelpCircle, RefreshCw, Trash2, Upload, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { applyDecisions, matchSummary, matchTransactions, nameKey, namesSupplier, parseStatementRows, type BankTransaction, type MatchDecisions, type MatchedTransaction, type NameMemory, type PayableInvoice } from "@/lib/bank-matching";
import { accountantWorkbook, customPeriodKey, customPeriodLabel, periodOptions, rowsInPeriod, verifiedVat } from "@/lib/bank-vat-export";
import { parseAiStatement, statementTable } from "@/lib/ai-statement";
import { businessForm } from "@/lib/browser-business";
import { preparePagesForUpload } from "@/lib/document-extraction";

const money = (value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
const ukDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
type Filter = "All" | "Matched" | "Possible match" | "No invoice";
const FILTER_LABELS: Record<Filter, string> = { All: "All", Matched: "Verified", "Possible match": "To check", "No invoice": "No invoice" };
type Session = { fileName: string; transactions: BankTransaction[]; decisions: MatchDecisions };

function readStored<T>(key: string): T | null {
  try { const raw = window.localStorage.getItem(key); return raw ? JSON.parse(raw) as T : null; } catch { return null; }
}
function store(key: string, value: unknown) {
  try { if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
}

export function BankPaymentMatching({ companyId, companyName }: { companyId: string; companyName?: string }) {
  const sessionKey = `vtv-bank-match:v1:${companyId}`, namesKey = `vtv-bank-names:v1:${companyId}`;
  const [fileName, setFileName] = useState("");
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [invoices, setInvoices] = useState<PayableInvoice[]>([]);
  const [decisions, setDecisions] = useState<MatchDecisions>({});
  const [names, setNames] = useState<NameMemory>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>("All");
  const [period, setPeriod] = useState("all"), [customFrom, setCustomFrom] = useState(""), [customTo, setCustomTo] = useState("");

  async function loadInvoices() {
    const response = await fetch("/api/business/payable-invoices", { headers: { "x-company-id": companyId }, cache: "no-store", signal: AbortSignal.timeout(30000) });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error?.message ?? "Your purchase invoices could not be loaded.");
    const items = body.data.items as PayableInvoice[];
    setInvoices(items);
    return items;
  }

  // Work in progress survives a refresh or a trip to scan a missing receipt.
  useEffect(() => {
    setNames(readStored<NameMemory>(namesKey) ?? {});
    const saved = readStored<Session>(sessionKey);
    if (!saved?.transactions?.length) return;
    setFileName(saved.fileName); setTransactions(saved.transactions); setDecisions(saved.decisions ?? {});
    setBusy(true);
    void loadInvoices().catch(reason => setError(reason instanceof Error ? reason.message : "Your purchase invoices could not be loaded.")).finally(() => setBusy(false));
  }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (transactions.length) store(sessionKey, { fileName, transactions, decisions } satisfies Session); }, [sessionKey, fileName, transactions, decisions]);

  async function importFile(file: File | undefined) {
    if (!file) return;
    setError(""); setNotice(""); setBusy(true);
    try {
      const picture = /\.(pdf|jpe?g|png|webp)$/i.test(file.name) || /^image\/|application\/pdf/.test(file.type);
      if (!picture && file.size > 5 * 1024 * 1024) throw new Error("Choose a statement file no larger than 5 MB.");
      if (!picture && !/\.(csv|xlsx|xls)$/i.test(file.name)) throw new Error("Choose an Excel or CSV file, a PDF, or a photo of the statement.");
      let table: unknown[][];
      if (picture) {
        // PDF or photo of the statement: read by the AI reader, then matched exactly like a spreadsheet.
        setNotice("Reading the statement…");
        const upload = await preparePagesForUpload([file], AbortSignal.timeout(60000)), form = new FormData();
        upload.pages.forEach((part, index) => form.append("page", part, `page-${index + 1}.${part.type === "application/pdf" ? "pdf" : "jpg"}`));
        form.append("kind", "statement");
        const data = await businessForm(companyId, "invoice-extract", form, AbortSignal.timeout(45000)).catch(() => { throw new Error("The statement could not be read. Try a clearer photo, or download the statement as Excel or CSV from your online banking."); });
        table = statementTable(parseAiStatement(data?.statement));
      } else {
        const book = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false, raw: file.name.toLowerCase().endsWith(".csv") });
        table = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[book.SheetNames[0]], { header: 1, raw: true, defval: "" });
      }
      const parsed = parseStatementRows(table);
      if (parsed.error) throw new Error(parsed.error);
      if (!parsed.transactions.length) throw new Error("No rows with a date and amount were found in this file.");
      await loadInvoices();
      setTransactions(parsed.transactions); setDecisions({}); setFileName(file.name); setFilter("All"); setPeriod("all");
      setNotice(`${parsed.transactions.length} rows read${parsed.skipped ? `, ${parsed.skipped} rows without a date or amount skipped` : ""}.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The statement could not be read."); }
    finally { setBusy(false); }
  }

  async function recheck() {
    setError(""); setNotice(""); setBusy(true);
    try { await loadInvoices(); setNotice("Checked again against your latest invoices."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Your purchase invoices could not be loaded."); }
    finally { setBusy(false); }
  }

  function clearStatement() {
    if (!window.confirm("Remove this statement and your checks from this page?")) return;
    store(sessionKey, null); setTransactions([]); setDecisions({}); setFileName(""); setNotice(""); setError("");
  }

  const rows = useMemo(() => applyDecisions(matchTransactions(transactions, invoices, names), decisions, invoices), [transactions, invoices, names, decisions]);
  const periods = useMemo(() => periodOptions(rows), [rows]);
  // "Custom dates" uses the From and To boxes; nothing is selected until both are filled.
  const periodKey = period === "custom" && customFrom && customTo ? customPeriodKey(customFrom, customTo) : period;
  const selected = useMemo(() => rowsInPeriod(rows, periodKey), [rows, periodKey]);
  const summary = useMemo(() => matchSummary(selected), [selected]);
  const visible = selected.filter(row => filter === "All" || row.status === filter);
  const unverified = summary.possible + summary.missing;
  const periodLabel = periodKey.startsWith("c:") ? customPeriodLabel(periodKey) : periods.find(item => item.key === period)?.label ?? "All dates";

  // Confirming a different name teaches it for the next statement.
  function verify(row: MatchedTransaction, invoiceId: string) {
    const invoice = invoices.find(item => item.id === invoiceId);
    if (!invoice) return;
    setDecisions(old => ({ ...old, [row.id]: invoice.id }));
    if (row.description && !namesSupplier(row.description, invoice.supplierName) && nameKey(row.description)) {
      const next = { ...names, [nameKey(row.description)]: nameKey(invoice.supplierName) };
      setNames(next); store(namesKey, next);
    }
  }
  function reject(row: MatchedTransaction) {
    setDecisions(old => ({ ...old, [row.id]: null }));
    const key = nameKey(row.description);
    if (names[key]) { const next = { ...names }; delete next[key]; setNames(next); store(namesKey, next); }
  }

  function exportForAccountant() {
    const book = accountantWorkbook(selected, { company: companyName ?? "", statement: fileName, period: periodLabel, origin: window.location.origin });
    const safe = (value: string) => value.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
    XLSX.writeFile(book, `${[safe(companyName ?? ""), "Bank-VAT", safe(periodLabel)].filter(Boolean).join("_")}.xlsx`);
  }
  function downloadTemplate() {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Supplier", "Amount", "Date"]]), "Statement");
    XLSX.writeFile(book, "bank-statement-template.xlsx");
  }

  return <div className="grid min-w-0 grid-cols-1 gap-5">
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-xl font-bold">Bank VAT matching</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">Upload your bank statement as Excel, CSV, PDF or a photo. Each payment is matched by amount to the saved invoices of the company selected above, and the VAT is added. Check the results, then export Excel for your accountant.</p></div>
        <div className="flex flex-wrap gap-2">
          <label className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md bg-brand-700 px-4 text-sm font-semibold text-white ${busy ? "opacity-60" : ""}`}><Upload className="h-4 w-4" />{busy ? "Reading…" : transactions.length ? "Upload new statement" : "Upload statement"}
            <input type="file" accept=".csv,.xlsx,.xls,.pdf,.jpg,.jpeg,.png,.webp,image/*" aria-label="Upload bank statement" className="sr-only" disabled={busy} onChange={e => { void importFile(e.currentTarget.files?.[0]); e.currentTarget.value = ""; }} /></label>
          <Button type="button" variant="outline" onClick={downloadTemplate}><FileSpreadsheet className="h-4 w-4" />Template</Button>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">Columns needed: Supplier, Amount and Date. Bank exports with Paid out / Paid in also work. The file stays in this browser.</p>
      {error ? <p role="alert" className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      {notice ? <p role="status" className="mt-3 rounded-md bg-brand-50 p-3 text-sm text-brand-800"><FileSpreadsheet className="mr-1 inline h-4 w-4" />{fileName}: {notice}</p> : null}
    </Card>

    {transactions.length ? <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([["Total paid", money(summary.paidOut), `${summary.paymentsOut} payments`], ["VAT to claim", money(summary.vatEvidenced), `${summary.matched} verified`],
          ["To check", String(summary.possible), `${money(summary.vatToConfirm)} VAT if confirmed`], ["No invoice", String(summary.missing), `${money(summary.unmatchedAmount)} with £0 VAT`]] as const)
          .map(([label, value, hint]) => <Card key={label} className="p-4"><p className="text-xs font-semibold text-muted">{label}</p><p className="mt-1 text-xl font-bold tabular-nums">{value}</p><p className="text-xs text-muted">{hint}</p></Card>)}
      </div>
      <Card className="min-w-0 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter payments">
            {(["All", "Matched", "Possible match", "No invoice"] as Filter[]).map(value => <button key={value} type="button" role="tab" aria-selected={filter === value} onClick={() => setFilter(value)}
              className={`min-h-9 rounded-full px-3 text-xs font-semibold ${filter === value ? "bg-brand-700 text-white" : "bg-wash text-muted"}`}>{FILTER_LABELS[value]}</button>)}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-xs font-semibold text-muted">Period
              <select className="field-control min-w-40 text-sm" value={period} onChange={e => setPeriod(e.target.value)}>{periods.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
            {period === "custom" ? <><label className="grid gap-1 text-xs font-semibold text-muted">From<input type="date" className="field-control text-sm" value={customFrom} max={customTo || undefined} onChange={e => setCustomFrom(e.target.value)} /></label>
              <label className="grid gap-1 text-xs font-semibold text-muted">To<input type="date" className="field-control text-sm" value={customTo} min={customFrom || undefined} onChange={e => setCustomTo(e.target.value)} /></label></> : null}
            <Button type="button" variant="outline" disabled={busy} onClick={() => void recheck()}><RefreshCw className="h-4 w-4" />Check again</Button>
            <Button type="button" onClick={exportForAccountant} disabled={!selected.length}><Download className="h-4 w-4" />Export for accountant</Button>
            <Button type="button" variant="ghost" aria-label="Remove statement" title="Remove statement" onClick={clearStatement}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
        {unverified ? <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{unverified} payment{unverified === 1 ? " is" : "s are"} not verified and will export with VAT £0.</p> : null}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="text-xs text-muted"><tr><th className="py-2 pl-2">Date</th><th>Supplier</th><th className="text-right">Amount</th><th className="pl-4">Invoice</th><th className="text-right">VAT</th><th className="pl-4">Verified</th></tr></thead>
            <tbody>{visible.map(row => <tr key={row.id} className={`border-t border-line align-top ${row.status === "Matched" ? "bg-emerald-50/60" : row.status === "Possible match" ? "bg-amber-50/70" : "bg-red-50/50"}`}>
              <td className="whitespace-nowrap py-3 pl-2">{ukDate(row.date)}</td>
              <td className="py-3 pr-3">{row.description || "—"}</td>
              <td className="py-3 text-right font-semibold tabular-nums">{money(row.amount)}</td>
              <td className="py-3 pl-4">{row.invoice ? <><Link href={`/app/invoices/${row.invoice.id}`} className="font-semibold text-brand-700 underline">{row.invoice.number}</Link><span className="block text-xs text-muted">{row.invoice.supplierName} · {ukDate(row.invoice.issuedOn)}{row.invoice.state === "draft" ? " · Draft" : ""}</span></> : <span className="text-muted">—</span>}</td>
              <td className="py-3 text-right tabular-nums">{row.status === "Matched" ? <span className="font-semibold">{money(verifiedVat(row))}</span> : row.invoice ? <span className="text-muted">{money(row.invoice.vat)}?</span> : money(0)}</td>
              <td className="py-3 pl-4">
                {row.status === "Matched" ? <span className="inline-flex items-center gap-1 font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" />Verified</span>
                  : row.status === "Possible match" ? <span className="inline-flex items-center gap-1 font-semibold text-amber-700"><HelpCircle className="h-4 w-4" />Check this</span>
                  : <span className="inline-flex items-center gap-1 font-semibold text-red-700"><XCircle className="h-4 w-4" />No invoice</span>}
                <span className="block text-xs text-muted">{row.reason}</span>
                {row.candidates.length > 1 && row.status !== "Matched" ? <select aria-label={`Choose invoice for ${row.description || "payment"}`} className="field-control mt-1 min-h-9 max-w-64 py-1 text-xs" value={row.invoice?.id ?? ""} onChange={e => { if (e.target.value) verify(row, e.target.value); }}>
                  {row.invoice ? null : <option value="">Choose invoice</option>}{row.candidates.map(item => <option key={item.id} value={item.id}>{item.number} · {item.supplierName} · {ukDate(item.issuedOn)}</option>)}</select> : null}
                <span className="mt-1 flex flex-wrap items-center gap-2">
                  {row.status === "Possible match" && row.invoice ? <Button type="button" variant="outline" className="min-h-8 px-2 text-xs" onClick={() => verify(row, row.invoice!.id)}>Confirm</Button> : null}
                  {row.status === "No invoice" && row.candidates.length === 1 ? <Button type="button" variant="outline" className="min-h-8 px-2 text-xs" onClick={() => verify(row, row.candidates[0].id)}>Use {row.candidates[0].number}</Button> : null}
                  {row.invoice ? <Button type="button" variant="ghost" className="min-h-8 px-2 text-xs" onClick={() => reject(row)}>Not this</Button> : null}
                  {row.status === "No invoice" ? <Link href="/app/invoices/upload" className="text-xs font-semibold text-brand-700 underline">Scan the invoice</Link> : null}
                </span>
              </td></tr>)}</tbody>
          </table>
          {!visible.length ? <p className="py-6 text-center text-sm text-muted">No payments in this view.</p> : null}
        </div>
      </Card>
    </> : null}
  </div>;
}
