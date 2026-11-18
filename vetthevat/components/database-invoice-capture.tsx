"use client";
// Scan / upload an invoice, read it, then review and save it to the company's
// database through ManualInvoiceWorkspace. Nothing is stored until the person
// presses Save. PDFs with real text are read here, and go to the AI reader only if
// their totals do not reconcile. Photos and scanned PDFs go to the AI reader, all
// pages together; if it is unavailable they are read on this device.
import { useEffect, useRef, useState } from "react";
import { Camera, ExternalLink, FileUp, Loader2, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ManualInvoiceWorkspace } from "@/components/manual-invoice-workspace";
import { documentNeedsReading, extractDocumentText, preparePagesForUpload } from "@/lib/document-extraction";
import { hasTotalsProblem, invoiceDraftFromAi, invoiceDraftFromText, type ChosenSupplier, type InvoiceDraft } from "@/lib/captured-invoice-draft";
import { parseAiInvoice, type AiInvoice } from "@/lib/ai-invoice";
import { businessData, businessForm } from "@/lib/browser-business";
import { aiCacheKey, readAiCache, writeAiCache } from "@/lib/ai-invoice-cache";

type SupplierOption = { id: string; name: string; vat_number: string | null; status: string };
// The company's saved active suppliers (a few pages of 100).
async function loadSuppliers(companyId: string) {
  const all: SupplierOption[] = [];
  let after: string | null = null;
  for (let page = 0; page < 5; page++) {
    const query = new URLSearchParams({ kind: "supplier", limit: "100" });
    if (after) query.set("after", after);
    const response = await fetch(`/api/business/contacts?${query}`, { headers: { "x-company-id": companyId }, cache: "no-store" });
    if (!response.ok) break;
    const data = (await response.json()).data as { items: SupplierOption[]; after: string | null };
    all.push(...data.items.filter(item => item.status === "active"));
    after = data.after;
    if (!after) break;
  }
  return all.sort((a, b) => a.name.localeCompare(b.name));
}

const HMRC_VAT_CHECK = "https://www.tax.service.gov.uk/check-vat-number/enter-vat-details";
const ACCEPTED = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_PAGES = 10;
const AI_TIMEOUT_MS = 30000;
const AI_FALLBACK_NOTE = "The AI reader was unavailable, so this was read on this device.";
const money = (value: number | null, currency: string) => value === null ? "" : new Intl.NumberFormat("en-GB", { style: "currency", currency: currency || "GBP" }).format(value);
const ukDate = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "";

// One read page: the main reading and the supplementary (totals) reading, split at the form feed.
// needsReading: a photo or scanned PDF (not a PDF with a real text layer). hasText: the on-device reading has been done.
type Page = { id: number; file: File; preview: string; main: string; sparse: string; notes: string[]; needsReading: boolean; hasText: boolean };
type AiReading = { ids: string; invoice: AiInvoice; pageCount: number };
const browserStore = () => { try { return window.localStorage; } catch { return null; } };
const pageIds = (pages: Page[]) => pages.map(page => page.id).join("-");

// All pages as one document: main readings in page order, then all supplementary readings after one form feed.
export function combinedPageText(pages: { main: string; sparse: string }[]) {
  const main = pages.map(page => page.main).join("\n");
  const sparse = pages.map(page => page.sparse).filter(Boolean).join("\n");
  return sparse ? `${main}\n\f\n${sparse}` : main;
}

export function DatabaseInvoiceCapture({ companyId, companyName }: { companyId: string; companyName?: string }) {
  const [pages, setPages] = useState<Page[]>([]);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<InvoiceDraft | null>(null);
  const [copied, setCopied] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  // Chosen before scanning; kept for the next scan (several invoices from one supplier).
  const [supplierId, setSupplierId] = useState("");
  const supplierRef = useRef<ChosenSupplier | undefined>(undefined);
  const [aiAvailable, setAiAvailable] = useState(false);
  const aiCheck = useRef<Promise<boolean> | null>(null), aiReading = useRef<AiReading | null>(null), aiFailed = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const pagesRef = useRef<Page[]>([]);
  const nextId = useRef(1);
  const picker = useRef<HTMLInputElement>(null), camera = useRef<HTMLInputElement>(null);
  const morePicker = useRef<HTMLInputElement>(null), moreCamera = useRef<HTMLInputElement>(null);

  useEffect(() => () => { controller.current?.abort(); pagesRef.current.forEach(page => URL.revokeObjectURL(page.preview)); }, []);
  useEffect(() => { let active = true; void loadSuppliers(companyId).then(list => { if (active) setSuppliers(list); }, () => undefined); return () => { active = false; }; }, [companyId]);

  function checkAi() {
    aiCheck.current ??= businessData(companyId, "invoice-extract").then(result => result?.available === true, () => false);
    return aiCheck.current;
  }
  useEffect(() => { aiCheck.current = null; let active = true; void checkAi().then(available => { if (active) setAiAvailable(available); }); return () => { active = false; }; }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  function chooseSupplier(id: string) {
    setSupplierId(id);
    const found = suppliers.find(item => item.id === id);
    supplierRef.current = found ? { id: found.id, name: found.name, vatNumber: found.vat_number ?? "" } : undefined;
  }

  function buildDraft(next: Page[]): InvoiceDraft {
    const source = next.length > 1 ? `${next[0].file.name} (+${next.length - 1} more page${next.length > 2 ? "s" : ""})` : next[0].file.name;
    const context = { companyName, supplier: supplierRef.current };
    const ai = aiReading.current?.ids === pageIds(next) ? aiReading.current : null;
    const parsed = ai ? invoiceDraftFromAi(ai.invoice, source, { ...context, pageCount: ai.pageCount, readBy: "gemini" })
      : invoiceDraftFromText(combinedPageText(next), source, { ...context, ...(next.some(page => page.file.type === "application/pdf") ? {} : { pageCount: next.length }), readBy: next.some(page => page.needsReading) ? "tesseract" : "pdf-text" });
    const notes = [...new Set([...(!ai && aiFailed.current ? [AI_FALLBACK_NOTE] : []), ...(ai ? [] : next.flatMap(page => page.notes))])];
    return notes.length ? { ...parsed, warnings: [...notes, ...parsed.warnings] } : parsed;
  }

  function show(next: Page[]) {
    pagesRef.current = next; setPages(next);
    setDraft(next.length ? buildDraft(next) : null);
  }

  // All pages together, in one request; a repeat of the same files uses the saved reading.
  // Nothing to read, or any failure, returns false: the caller reads on this device.
  async function readWithAi(list: Page[], abort: AbortController, force = false) {
    aiFailed.current = false;
    if ((!force && !list.some(page => page.needsReading)) || !await checkAi()) return false;
    const files = list.map(page => page.file), store = browserStore();
    let cacheKey: string | null = null;
    try {
      cacheKey = await aiCacheKey(companyId, files);
      const saved = store ? readAiCache(store, cacheKey) : null;
      if (saved) { aiReading.current = { ids: pageIds(list), ...saved }; return true; }
    } catch { cacheKey = null; }
    const attempt = new AbortController(), stop = () => attempt.abort(), timer = window.setTimeout(stop, AI_TIMEOUT_MS);
    abort.signal.addEventListener("abort", stop, { once: true });
    try {
      setStatus("Reading invoice…"); setProgress(30);
      const upload = await preparePagesForUpload(files, attempt.signal), form = new FormData();
      upload.pages.forEach((part, index) => form.append("page", part, `page-${index + 1}.${part.type === "application/pdf" ? "pdf" : "jpg"}`));
      setProgress(55);
      const result = await businessForm(companyId, "invoice-extract", form, attempt.signal);
      const reading = { invoice: parseAiInvoice(result?.invoice), pageCount: upload.pageCount };
      aiReading.current = { ids: pageIds(list), ...reading };
      if (store && cacheKey) { try { writeAiCache(store, cacheKey, reading); } catch { /* storage full or blocked */ } }
      return true;
    } catch {
      if (!abort.signal.aborted) aiFailed.current = true;
      return false;
    } finally { window.clearTimeout(timer); abort.signal.removeEventListener("abort", stop); }
  }

  // The on-device reading, for every page that does not have one yet.
  async function readOnDevice(list: Page[], abort: AbortController) {
    for (const [index, page] of list.entries()) {
      if (page.hasText) continue;
      const label = list.length > 1 ? `Page ${index + 1}: ` : "", notes: string[] = [];
      setStatus(list.length > 1 ? `Reading page ${index + 1}` : "Reading the document"); setProgress(5);
      const text = await extractDocumentText(page.file, abort.signal, (message, percent) => { setStatus(label + message); setProgress(percent); }, notes);
      if (abort.signal.aborted) return false;
      const split = text.indexOf("\f");
      Object.assign(page, { main: split < 0 ? text : text.slice(0, split).trim(), sparse: split < 0 ? "" : text.slice(split + 1).trim(), notes, hasText: true });
    }
    return true;
  }

  // A text PDF whose totals do not reconcile gets one AI reading, kept only if it reconciles.
  async function recheckTextPdf(list: Page[], abort: AbortController) {
    if (list.some(page => page.needsReading) || !hasTotalsProblem(buildDraft(list))) return;
    setStatus("Double-checking the totals"); setProgress(90);
    if (await readWithAi(list, abort, true) && hasTotalsProblem(buildDraft(list))) aiReading.current = null;
    aiFailed.current = false;
  }

  // addPage: keep the pages already read and add this one as the next page.
  async function read(chosen: File | undefined, addPage = false) {
    if (!chosen) return;
    controller.current?.abort();
    setError(""); setCopied(false);
    if (!ACCEPTED.includes(chosen.type)) { setError("Choose a PDF, JPG, PNG or WEBP file."); return; }
    if (!chosen.size || chosen.size > 10 * 1024 * 1024) { setError("Choose a file no larger than 10 MB."); return; }
    if (addPage && pagesRef.current.length >= MAX_PAGES) { setError(`An invoice can have up to ${MAX_PAGES} pages.`); return; }
    if (!addPage) { pagesRef.current.forEach(page => URL.revokeObjectURL(page.preview)); aiReading.current = null; aiFailed.current = false; show([]); }
    const abort = new AbortController(); controller.current = abort;
    const timer = window.setTimeout(() => abort.abort(), 150000);
    const preview = URL.createObjectURL(chosen);
    let kept = false;
    try {
      setStatus("Reading the document"); setProgress(5);
      const needsReading = await documentNeedsReading(chosen, abort.signal);
      const page: Page = { id: nextId.current++, file: chosen, preview, main: "", sparse: "", notes: [], needsReading, hasText: false };
      const list = [...pagesRef.current, page];
      if (!await readWithAi(list, abort)) {
        if (abort.signal.aborted || !await readOnDevice(list, abort)) return;
        if (!(page.main + page.sparse).trim()) { setError("No readable text was found. Try a clearer photo, or enter the invoice manually."); return; }
        await recheckTextPdf(list, abort);
      }
      if (abort.signal.aborted) return;
      setProgress(95);
      kept = true;
      show(list);
      setProgress(100);
    } catch (reason) {
      if (!abort.signal.aborted || controller.current === abort) setError(reason instanceof Error ? reason.message : "The document could not be read.");
    } finally { window.clearTimeout(timer); if (!kept) URL.revokeObjectURL(preview); if (controller.current === abort) setStatus(""); }
  }

  async function removePage(id: number) {
    const page = pagesRef.current.find(item => item.id === id), list = pagesRef.current.filter(item => item.id !== id);
    if (page) URL.revokeObjectURL(page.preview);
    const wasAi = aiReading.current !== null;
    aiReading.current = null;
    if (!wasAi || !list.length) { show(list); return; }
    // The AI reading covered the removed page, so read the remaining pages again.
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    try {
      setError("");
      if (await readWithAi(list, abort) || (!abort.signal.aborted && await readOnDevice(list, abort))) show(list);
    } catch (reason) { if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : "The document could not be read."); }
    finally { if (controller.current === abort) setStatus(""); }
  }

  function reset() { controller.current?.abort(); pagesRef.current.forEach(page => URL.revokeObjectURL(page.preview)); aiReading.current = null; aiFailed.current = false; show([]); setError(""); setStatus(""); setProgress(0); }

  const vatDigits = (draft?.supplierVatNumber ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().replace(/^GB/, "");
  const reading = Boolean(status);
  const progressBox = reading ? <div role="status" className="mt-4 rounded-md bg-brand-50 p-3 text-sm"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />{status}
    <div className="mt-2 h-2 rounded-full bg-white"><div className="h-2 rounded-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} /></div>
    <Button type="button" variant="outline" className="mt-3" onClick={() => controller.current?.abort()}>Stop</Button></div> : null;
  const errorBox = error ? <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p> : null;
  const first = pages[0];
  const more = pages.length > 1 ? ` + ${pages.length - 1} more page${pages.length > 2 ? "s" : ""}` : "";

  return <div className="grid min-w-0 gap-6">
    {!draft ? <Card className="p-5">
      <h2 className="text-xl font-bold">Scan or upload a supplier invoice or receipt</h2>
      <p className="mt-1 text-sm text-muted">{aiAvailable ? "Photos and scanned PDFs are sent securely to Google Gemini to be read. PDFs with real text are read on this device, and are sent only if their totals cannot be confirmed." : "The invoice or till receipt is read on this device."} You check every value before it is saved to your company records. For an invoice with more than one page, start with page 1; you can add the other pages next.</p>
      <label className="mt-4 grid gap-1 text-sm font-semibold">Supplier (optional)
        <select className="field-control" value={supplierId} disabled={reading} onChange={e => chooseSupplier(e.target.value)}>
          <option value="">Not sure / new supplier – read it from the document</option>
          {suppliers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <span className="text-xs font-normal text-muted">Choose the supplier first for the most accurate result: its saved name and VAT number are used, and only the invoice details are read from the photo.</span>
      </label>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Button type="button" variant="outline" disabled={reading} onClick={() => camera.current?.click()}><Camera className="h-4 w-4" />Take a photo</Button>
        <Button type="button" disabled={reading} onClick={() => picker.current?.click()}><FileUp className="h-4 w-4" />Upload PDF or image</Button>
      </div>
      <input ref={camera} hidden type="file" accept="image/*" capture="environment" aria-label="Take invoice photo" onChange={e => { void read(e.currentTarget.files?.[0]); e.currentTarget.value = ""; }} />
      <input ref={picker} hidden type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" aria-label="Choose invoice file" onChange={e => { void read(e.currentTarget.files?.[0]); e.currentTarget.value = ""; }} />
      <p className="mt-3 text-xs text-muted">PDF, JPG, PNG or WEBP · up to 10 MB · PDFs up to 20 pages</p>
      {progressBox}{errorBox}
    </Card> : null}

    {draft && first ? <>
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-xl font-bold">{draft.receipt ? "Receipt read" : "Read"} from {first.file.name}{more}</h2><p className="text-sm text-muted">Check these against the document, then complete and save below.</p></div>
          <Button type="button" variant="outline" disabled={reading} onClick={reset}><RotateCcw className="h-4 w-4" />Scan another</Button>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-brand-200 bg-brand-50 p-4 sm:grid-cols-3">
          {([[draft.supplierId ? "Supplier (chosen)" : "Supplier", draft.supplierName], [draft.receipt ? "Receipt date" : "Invoice date", ukDate(draft.issuedOn)], [draft.receipt ? "Receipt number" : "Invoice number", draft.number],
            ["Net (goods)", money(draft.summary.net, draft.currency)], ["VAT", money(draft.summary.vat, draft.currency)], ["Gross total", money(draft.summary.gross, draft.currency)]] as [string, string][])
            .map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs font-medium text-muted">{label}</dt>
              <dd className={`mt-0.5 break-words tabular-nums ${value ? "font-semibold" : "text-sm text-amber-800"}`}>{value || "Not found — enter below"}</dd></div>)}
          <div className="col-span-2 min-w-0 sm:col-span-3"><dt className="text-xs font-medium text-muted">Supplier VAT number</dt>
            <dd className="mt-0.5 flex flex-wrap items-center gap-3"><span className={draft.supplierVatNumber ? "font-semibold" : "text-sm text-amber-800"}>{draft.supplierVatNumber || (draft.supplierId ? "Not saved for this supplier (add it on the Suppliers page)" : "Not found on the document")}</span>
              {/^\d{9}(?:\d{3})?$/.test(vatDigits) ? <a href={HMRC_VAT_CHECK} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 underline"
                onClick={() => { void navigator.clipboard?.writeText(vatDigits).then(() => setCopied(true), () => undefined); }}><ExternalLink className="h-3.5 w-3.5" />Check with HMRC</a> : null}
              {copied ? <span className="text-xs text-muted">Number copied — paste it into HMRC&apos;s checker.</span> : null}</dd></div>
        </dl>
        <div className="mt-4 rounded-lg border border-line p-3">
          <p className="text-sm font-semibold">Does this invoice have more pages?</p>
          <p className="mt-0.5 text-xs text-muted">Add each page before editing below; the items and totals are read again from all pages together.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={reading || pages.length >= MAX_PAGES} onClick={() => moreCamera.current?.click()}><Plus className="h-4 w-4" />Add next page (photo)</Button>
            <Button type="button" variant="outline" disabled={reading || pages.length >= MAX_PAGES} onClick={() => morePicker.current?.click()}><Plus className="h-4 w-4" />Add next page (file)</Button>
          </div>
          <input ref={moreCamera} hidden type="file" accept="image/*" capture="environment" aria-label="Take photo of next page" onChange={e => { void read(e.currentTarget.files?.[0], true); e.currentTarget.value = ""; }} />
          <input ref={morePicker} hidden type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" aria-label="Choose next page file" onChange={e => { void read(e.currentTarget.files?.[0], true); e.currentTarget.value = ""; }} />
          {progressBox}{errorBox}
        </div>
      </Card>
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <Card className="grid min-w-0 gap-3 overflow-hidden p-2">{pages.map((page, index) => <div key={page.id} className="min-w-0">
          {pages.length > 1 ? <div className="flex items-center justify-between px-1 pb-1 text-xs text-muted"><span className="font-semibold">Page {index + 1}</span>{index > 0 ? <button type="button" className="underline" disabled={reading} onClick={() => void removePage(page.id)}>Remove page</button> : null}</div> : null}
          {page.file.type === "application/pdf"
            ? <iframe title={`Uploaded invoice page ${index + 1}`} src={page.preview} className="h-[70vh] w-full rounded" />
            : <img src={page.preview} alt={`Uploaded invoice page ${index + 1}`} className="max-h-[70vh] w-full rounded object-contain" />}
        </div>)}</Card>
        <ManualInvoiceWorkspace key={companyId + pages.map(page => page.id).join("-")} companyId={companyId} path="/app/invoices/new" capturedDraft={draft} />
      </div>
    </> : null}
  </div>;
}
