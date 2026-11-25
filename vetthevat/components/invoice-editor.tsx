"use client";

import {ukDate} from "@/lib/uk-date";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, Plus, Save, Trash2 } from "lucide-react";
import { useAppState } from "@/components/app-state";
import { useToast } from "@/components/toast-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Invoice, InvoiceLineItem } from "@/lib/domain";
import { validateInvoice } from "@/lib/invoice-rules";
import { buildVATBreakdown, calculateInvoiceTotals, calculateLine } from "@/lib/vat-calculations";
import { formatCurrency } from "@/lib/utils";
import { useUnsavedChanges } from "@/components/navigation-guard";
import { TextField } from "@/components/ui/field";
import {validateTaxReview} from "@/lib/invoice-tax-review";

const inputClass = "field-control";
const HMRC_VAT_CHECK = "https://www.tax.service.gov.uk/check-vat-number/enter-vat-details";

// The figures a bookkeeper needs first, before any line-by-line detail.
function InvoiceHeadline({ invoice }: { invoice: Invoice }) {
  const { showToast } = useToast();
  const vatDigits = invoice.supplierVatNumber.replace(/[^A-Za-z0-9]/g, "").toUpperCase().replace(/^GB/, "");
  const checkable = /^\d{9}(?:\d{3})?$/.test(vatDigits);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(invoice.invoiceDate) ? ukDate(invoice.invoiceDate) : "";
  const read = invoice.sourceTotals;
  const money = (value: number, found: boolean) => found || value > 0 ? formatCurrency(value, invoice.currency) : "";
  const tiles: [string, string, boolean][] = [
    ["Supplier", invoice.supplierName.trim(), false],
    ["Invoice date", date, false],
    ["Net (goods)", money(invoice.subtotal, !read || read.subtotal !== null), false],
    ["VAT", money(invoice.vatAmount, !read || read.vatAmount !== null || invoice.subtotal > 0), true],
    ["Gross total", money(invoice.totalAmount, !read || read.totalAmount !== null), true],
  ];
  return <section aria-label="Invoice summary" className="mt-4 rounded-lg border border-brand-200 bg-brand-50 p-4">
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
      {tiles.map(([label, value, strong]) => <div key={label} className={label === "Supplier" ? "col-span-2 min-w-0 sm:col-span-1" : "min-w-0"}>
        <dt className="text-xs font-medium text-muted">{label}</dt>
        <dd className={`mt-0.5 break-words tabular-nums ${value ? strong ? "text-lg font-bold text-brand-800" : "font-semibold" : "text-sm font-medium text-amber-800"}`}>{value || "Not found — enter below"}</dd>
      </div>)}
      <div className="min-w-0">
        <dt className="text-xs font-medium text-muted">Supplier VAT number</dt>
        <dd className={`mt-0.5 break-words ${invoice.supplierVatNumber.trim() ? "font-semibold" : "text-sm font-medium text-amber-800"}`}>{invoice.supplierVatNumber.trim() || "Not found — enter below"}</dd>
        {checkable ? <a href={HMRC_VAT_CHECK} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 underline underline-offset-2"
          onClick={() => { void navigator.clipboard?.writeText(vatDigits).then(() => showToast({ title: "VAT number copied", description: `HMRC's checker has opened in a new tab. Paste ${vatDigits} there to confirm the registration.`, tone: "info" }), () => undefined); }}>
          <ExternalLink className="h-3.5 w-3.5" />Check with HMRC</a> : null}
      </div>
    </dl>
  </section>;
}

export function InvoiceEditor({ initialInvoice, onCancel, onSaved, onRetry, showPayment = false }: { initialInvoice: Invoice; onCancel: () => void; onSaved?: (invoice: Invoice) => void; onRetry?: () => void; showPayment?: boolean }) {
  const [invoice, setInvoice] = useState(initialInvoice);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [sourceChecked, setSourceChecked] = useState(false);
  const [sourceEdited, setSourceEdited] = useState(false);
  const submitting = useRef(false);
  const baseline = useRef(JSON.stringify(initialInvoice));
  const guard = useUnsavedChanges(JSON.stringify(invoice) !== baseline.current);
  const errorSummary = useRef<HTMLUListElement>(null);
  const { invoices, saveInvoice, deleteInvoice, selectedCompanyId, selectedCompany, customers, suppliers, storageReady } = useAppState();
  const { showToast } = useToast();
  const router = useRouter();
  const computed = calculateInvoiceTotals(invoice.lineItems);
  const source = invoice.sourceTotals;
  const mismatches = [...validateInvoice(invoice, invoices),...validateTaxReview(invoice)];

  function field<K extends keyof Invoice>(key: K, value: Invoice[K]) {
    setInvoice((current) => ({ ...current, [key]: value }));
    setSourceChecked(false);
  }

  function linesChanged(lineItems: InvoiceLineItem[]) {
    setInvoice((current) => ({ ...current, lineItems, ...calculateInvoiceTotals(lineItems), vatBreakdown: buildVATBreakdown(lineItems) }));
    setSourceChecked(false);
    setSourceEdited(true);
  }

  function editLine(id: string, key: "description" | "quantity" | "unitPrice" | "discount" | "vatRate", text: string) {
    linesChanged(invoice.lineItems.map((line) => line.id !== id ? line : calculateLine({ ...line, [key]: key === "description" ? text : text === "" ? Number.NaN : Number(text) })));
  }

  function save(confirmed: boolean) {
    if (submitting.current) return;
    const issues = confirmed ? [...validateInvoice(invoice, invoices),...validateTaxReview(invoice)] : [];
    if (invoice.companyId !== selectedCompanyId) issues.push("The selected company changed. Switch back to save this invoice.");
    if (invoice.lineItems.some((line) => [line.quantity, line.unitPrice, line.discount, line.vatRate].some((value) => !Number.isFinite(value))) || [invoice.subtotal, invoice.vatAmount, invoice.totalAmount].some((value) => !Number.isFinite(value))) issues.push("Complete numeric inputs before saving a draft.");
    if (confirmed && source && !sourceChecked) issues.push("Compare the source invoice and confirm that the reviewed fields and line breakdown are correct.");
    if (issues.length) { setErrors(issues); requestAnimationFrame(() => errorSummary.current?.focus()); return; }
    submitting.current = true;
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const action = confirmed ? "Invoice confirmed" : "Invoice draft saved";
      const event = { id: crypto.randomUUID(), user: "Workspace user", action, entity: invoice.invoiceNumber || invoice.id, details: "Invoice saved.", createdAt: now };
      const saved: Invoice = { ...invoice, vatBreakdown: buildVATBreakdown(invoice.lineItems), status: confirmed ? "Reviewed" : "Draft", processingStatus: confirmed ? "Confirmed" : "Ready for Review", reviewStatus: confirmed ? "Reviewed" : "Needs Review", warnings: confirmed ? [] : invoice.warnings, updatedAt: now, activity: [...invoice.activity, event] };
      saveInvoice(saved);
      baseline.current = JSON.stringify(invoice);
      guard.clear();
      setErrors([]);

      // Auto-sync purchase invoice to ORS orders & catalogue
      if (saved.transactionType !== "Sale" && saved.supplierName) {
        try {
          void fetch("/api/ors/supplier-invoices", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-company-id": selectedCompanyId
            },
            body: JSON.stringify({
              invoiceNumber: saved.invoiceNumber || "INV-NEW",
              supplier: saved.supplierName,
              invoiceDate: saved.invoiceDate,
              dueDate: saved.dueDate,
              currency: saved.currency,
              subtotal: saved.subtotal,
              vat: saved.vatAmount,
              total: saved.totalAmount,
              lines: saved.lineItems.map((l) => ({
                description: l.description,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                vatRate: l.vatRate,
                lineTotal: l.netAmount
              }))
            })
          }).catch(() => {});
        } catch {}
      }

      showToast({ title: confirmed ? "Invoice confirmed" : "Draft saved", description: "Saved. Its items are now included in price comparison.", tone: "success" });
      if (onSaved) onSaved(saved); else router.push(`/app/invoices/${saved.id}`);
    } catch (reason) { setErrors([reason instanceof Error ? reason.message : "Invoice could not be saved."]); }
    finally { submitting.current = false; setBusy(false); }
  }

  return <Card className="min-w-0 p-5">
    <h2 className="text-xl font-semibold tracking-tight">{source ? "Review extracted invoice" : "Invoice details"}</h2>
    <p className="mt-2 text-sm text-muted">Check the details before confirming. Not finished? Save it as a draft.</p>
    {source ? <p className="mt-2 text-xs text-muted">Extraction uses heuristic field matching, not calibrated confidence. Customer defaults come from the selected business and must be checked against the source.</p> : null}
    <InvoiceHeadline invoice={invoice} />
    {invoice.warnings.length ? <div className="mt-4 grid gap-2">{invoice.warnings.map((warning) => <p key={warning.id} className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{warning.title}: {warning.description}</p>)}</div> : null}
    {errors.length ? <ul ref={errorSummary} tabIndex={-1} role="alert" className="mt-4 list-inside list-disc rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{errors.map((error) => <li key={error}>{error}</li>)}</ul> : null}
    <div className="mt-5 grid gap-4 md:grid-cols-2">
      <label className="grid gap-2 text-sm font-semibold">Recorded transaction type<select className={inputClass} value={invoice.transactionType??""} onChange={event=>{const type=event.target.value as Invoice["transactionType"];setInvoice(current=>({...current,transactionType:type||undefined,customerId:undefined,...(type==="Sale"?{supplierId:"",supplierName:current.supplierName||selectedCompany.name,supplierVatNumber:current.supplierVatNumber||selectedCompany.vatNumber,customerName:current.customerName===selectedCompany.name?"":current.customerName,customerVatNumber:current.customerName===selectedCompany.name?"":current.customerVatNumber}:{} )}));setSourceChecked(false);}}><option value="">Unclassified — not inferred</option><option>Purchase</option><option>Sale</option></select><span className="text-xs font-normal text-muted">Set only after checking the document. Reporting does not determine input VAT recoverability.</span></label>
      {showPayment ? <label className="grid gap-2 text-sm font-semibold">Payment<select className={inputClass} value={invoice.paymentStatus ?? "Unpaid"} onChange={(event) => field("paymentStatus", event.target.value)}>{["Paid", "Unpaid", "Card", "Cash", "Bank transfer"].map((status) => <option key={status}>{status}</option>)}</select></label> : null}
      {invoice.transactionType!=="Sale"?<label className="grid gap-2 text-sm font-semibold">Existing supplier<select className={inputClass} value={suppliers.some((item) => item.id === invoice.supplierId) ? invoice.supplierId : ""} onChange={(event) => { const supplier = suppliers.find((item) => item.id === event.target.value); setInvoice({ ...invoice, supplierId: supplier?.id ?? "", supplierName: supplier?.name ?? invoice.supplierName, supplierVatNumber: supplier?.vatNumber ?? invoice.supplierVatNumber }); setSourceChecked(false); }}><option value="">Enter supplier details below</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>:<label className="grid gap-2 text-sm font-semibold">Existing customer<select className={inputClass} value={invoice.customerId??""} onChange={event=>{const customer=customers.find(row=>row.id===event.target.value);setInvoice({...invoice,customerId:customer?.id,customerName:customer?.name??invoice.customerName,customerVatNumber:customer?.vatNumber??invoice.customerVatNumber});setSourceChecked(false);}}><option value="">Enter customer details below</option>{customers.filter(row=>row.status!=="Archived"||row.id===invoice.customerId).map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
      <label className="grid gap-2 text-sm font-semibold">Currency<select className={inputClass} value={invoice.currency} onChange={(event) => field("currency", event.target.value as Invoice["currency"])}>{["GBP", "EUR", "USD"].map((currency) => <option key={currency}>{currency}</option>)}</select></label>
      {([ ["supplierName", "Supplier name", "text"], ["supplierVatNumber", "Supplier VAT number", "text"], ["invoiceNumber", "Invoice number", "text"], ["invoiceDate", "Invoice date", "date"], ["dueDate", "Due date (optional)", "date"], ["customerName", "Customer name", "text"], ["customerVatNumber", "Customer VAT number", "text"] ] as const).map(([key, label, type]) => <TextField key={key} label={invoice.transactionType==="Sale"&&key==="supplierName"?"Invoice issuer name":invoice.transactionType==="Sale"&&key==="supplierVatNumber"?"Issuer VAT number":label} type={type} value={invoice[key]} error={errors.length && ["supplierName", "invoiceNumber", "invoiceDate"].includes(key) && !invoice[key] ? `${label} is required for confirmation.` : undefined} onChange={(event) => { field(key, event.target.value); if (key === "supplierName") field("supplierId", ""); if(key==="customerName"||key==="customerVatNumber")field("customerId",undefined); }} />)}
    </div>
    <div className="mt-6 flex items-center justify-between"><h3 className="font-semibold">Line items</h3><span className="text-xs text-muted">{invoice.lineItems.length} lines · prices exclude VAT</span></div>
    <div className="mt-3 grid gap-3">{invoice.lineItems.map((line, index) => <fieldset key={line.id} className="min-w-0 rounded-lg border border-line p-4"><legend className="px-1 text-xs font-semibold text-muted">Line {index + 1}</legend>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {([ ["description", "Description"], ["quantity", "Quantity"], ["unitPrice", "Unit price"], ["discount", "Discount"], ["vatRate", "VAT %"] ] as const).map(([key,label]) => <div key={key} className={key === "description" ? "col-span-2 sm:col-span-4" : "min-w-0"}><TextField label={label} aria-label={`Line ${index + 1} ${key}`} type={key === "description" ? "text" : "number"} step={key === "quantity" || key === "unitPrice" ? "0.0001" : "0.01"} value={typeof line[key] === "number" && !Number.isFinite(line[key]) ? "" : line[key]} onChange={(event) => editLine(line.id, key, event.target.value)} /></div>)}
      </div>
      <label className="mt-3 grid gap-2 text-sm font-medium">Tax treatment<select aria-label={`Line ${index+1} tax classification`} className={inputClass} value={line.taxClassification??""} onChange={event=>linesChanged(invoice.lineItems.map(row=>row.id===line.id?{...row,taxClassification:event.target.value?event.target.value as InvoiceLineItem["taxClassification"]:undefined}:row))}><option value="">Unclassified — 0% is not inferred</option>{["Taxable","Zero-rated","Exempt","Out of scope"].map(value=><option key={value}>{value}</option>)}</select></label>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3"><dl className="flex flex-wrap gap-5 text-xs tabular-nums">{[["Net",line.netAmount],["VAT",line.vatAmount],["Gross",line.grossAmount]].map(([label,value])=><div key={label}><dt className="text-muted">{label}</dt><dd className="mt-1 font-semibold">{formatCurrency(Number(value),invoice.currency)}</dd></div>)}</dl><Button variant="ghost" aria-label={`Remove line ${index + 1}`} onClick={() => linesChanged(invoice.lineItems.filter((item) => item.id !== line.id))}><Trash2 className="h-4 w-4" /></Button></div>
    </fieldset>)}</div>
    <Button className="mt-4" variant="outline" onClick={() => linesChanged([...invoice.lineItems, calculateLine({ description: "", quantity: 1, unitPrice: 0, discount: 0, vatRate: 0 })])}><Plus className="h-4 w-4" />Add line</Button>
    <div className="mt-5 grid gap-3 rounded-lg bg-wash p-4 md:grid-cols-3">{([ ["subtotal", "Net amount"], ["vatAmount", "VAT amount"], ["totalAmount", "Gross total"] ] as const).map(([key, label]) => <label key={key} className="grid gap-2 text-sm font-semibold">{label}<input type="number" step="0.01" className={inputClass} value={Number.isFinite(invoice[key]) ? invoice[key] : ""} onChange={(event) => { field(key, event.target.value === "" ? Number.NaN : Number(event.target.value)); setSourceEdited(true); }} /><span className="text-xs font-normal text-muted">Lines: {formatCurrency(computed[key], invoice.currency)}{source?.[key] !== undefined && source[key] !== null ? ` · Extracted: ${formatCurrency(source[key], invoice.currency)}` : ""}</span></label>)}</div>
    <p className="mt-3 text-xs text-muted">Net-exclusive unit prices; absolute line discounts; decimal half-up rounding per line. VAT is rounded after line net. Editing lines recalculates the record totals; extracted totals remain shown for comparison. Mixed rates are supported.</p>
    {mismatches.length ? <ul className="mt-4 list-inside list-disc text-sm text-amber-900">{mismatches.map((message) => <li key={message}>{message}</li>)}</ul> : null}
    {sourceEdited && source ? <p className="mt-3 text-sm text-muted">Reviewed values differ from the initial extraction. The original extracted totals remain shown for comparison.</p> : null}
    {invoice.vatRateNeedsReview ? <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={false} onChange={() => field("vatRateNeedsReview", false)} />I have checked and set the VAT rate on every line against the source.</label> : null}
    {source ? <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={sourceChecked} onChange={(event) => setSourceChecked(event.target.checked)} />I have compared the fields, currency, line breakdown and totals with the original invoice.</label> : null}
    <label className="mt-4 grid gap-2 text-sm font-semibold">Notes<textarea className="min-h-20 rounded-md border border-line p-3" value={invoice.notes ?? ""} onChange={(event) => field("notes", event.target.value)} /></label>
    <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-5">
      <Button disabled={busy || !storageReady} onClick={() => save(true)}>
        <CheckCircle2 className="h-4 w-4" />Confirm & Save Invoice
      </Button>
      <Button disabled={busy || !storageReady} variant="outline" onClick={() => save(false)}>
        <Save className="h-4 w-4" />Save Draft
      </Button>
      {onRetry ? (
        <Button variant="outline" onClick={() => { if (guard.allowLeave()) { guard.clear(); onRetry(); } }}>
          Retry extraction
        </Button>
      ) : null}
      <Button variant="ghost" disabled={busy} onClick={() => { if (guard.allowLeave()) { guard.clear(); onCancel(); } }}>
        Cancel
      </Button>
      {invoices.some((item) => item.id === invoice.id) ? (
        <Button
          type="button"
          variant="outline"
          className="ml-auto text-red-600 hover:bg-red-50 hover:text-red-700"
          disabled={busy}
          onClick={() => {
            if (window.confirm(`Are you sure you want to delete invoice ${invoice.invoiceNumber || "draft"}? This cannot be undone.`)) {
              guard.clear();
              deleteInvoice(invoice.id);
              showToast({ title: "Invoice deleted", tone: "success" });
              if (onCancel) onCancel(); else router.push("/app/invoices");
            }
          }}
        >
          <Trash2 className="h-4 w-4 mr-1.5" />
          Delete Invoice
        </Button>
      ) : null}
    </div>
  </Card>;
}
