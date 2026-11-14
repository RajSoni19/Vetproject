"use client";
// Scan / upload an invoice, read it in the browser, then review and save it to
// the company's database through ManualInvoiceWorkspace. Nothing is stored
// until the person presses Save.
import { useEffect, useRef, useState } from "react";
import { Camera, ExternalLink, FileUp, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ManualInvoiceWorkspace } from "@/components/manual-invoice-workspace";
import { extractDocumentText } from "@/lib/document-extraction";
import { invoiceDraftFromText, type InvoiceDraft } from "@/lib/captured-invoice-draft";

const HMRC_VAT_CHECK = "https://www.tax.service.gov.uk/check-vat-number/enter-vat-details";
const ACCEPTED = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const money = (value: number | null, currency: string) => value === null ? "" : new Intl.NumberFormat("en-GB", { style: "currency", currency: currency || "GBP" }).format(value);
const ukDate = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "";

export function DatabaseInvoiceCapture({ companyId, companyName }: { companyId: string; companyName?: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<InvoiceDraft | null>(null);
  const [copied, setCopied] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const picker = useRef<HTMLInputElement>(null), camera = useRef<HTMLInputElement>(null);

  useEffect(() => () => { controller.current?.abort(); }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function read(chosen: File | undefined) {
    if (!chosen) return;
    controller.current?.abort();
    setError(""); setDraft(null); setCopied(false);
    if (!ACCEPTED.includes(chosen.type)) { setError("Choose a PDF, JPG, PNG or WEBP file."); return; }
    if (!chosen.size || chosen.size > 10 * 1024 * 1024) { setError("Choose a file no larger than 10 MB."); return; }
    setFile(chosen); setPreview(URL.createObjectURL(chosen));
    const abort = new AbortController(); controller.current = abort;
    const timer = window.setTimeout(() => abort.abort(), 120000);
    try {
      setStatus("Reading the document"); setProgress(5);
      const text = await extractDocumentText(chosen, abort.signal, (message, percent) => { setStatus(message); setProgress(percent); });
      if (abort.signal.aborted) return;
      if (!text.trim()) { setError("No readable text was found. Try a clearer photo, or enter the invoice manually."); return; }
      setProgress(95);
      setDraft(invoiceDraftFromText(text, chosen.name, { companyName }));
      setProgress(100);
    } catch (reason) {
      if (!abort.signal.aborted || controller.current === abort) setError(reason instanceof Error ? reason.message : "The document could not be read.");
    } finally { window.clearTimeout(timer); if (controller.current === abort) setStatus(""); }
  }

  function reset() { controller.current?.abort(); setFile(null); setDraft(null); setError(""); setStatus(""); setProgress(0); }

  const vatDigits = (draft?.supplierVatNumber ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().replace(/^GB/, "");
  const reading = Boolean(status);

  return <div className="grid min-w-0 gap-6">
    {!draft ? <Card className="p-5">
      <h2 className="text-xl font-bold">Scan or upload a supplier invoice</h2>
      <p className="mt-1 text-sm text-muted">The invoice is read on this device. You check every value before it is saved to your company records.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Button type="button" variant="outline" disabled={reading} onClick={() => camera.current?.click()}><Camera className="h-4 w-4" />Take a photo</Button>
        <Button type="button" disabled={reading} onClick={() => picker.current?.click()}><FileUp className="h-4 w-4" />Upload PDF or image</Button>
      </div>
      <input ref={camera} hidden type="file" accept="image/*" capture="environment" aria-label="Take invoice photo" onChange={e => { void read(e.currentTarget.files?.[0]); e.currentTarget.value = ""; }} />
      <input ref={picker} hidden type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" aria-label="Choose invoice file" onChange={e => { void read(e.currentTarget.files?.[0]); e.currentTarget.value = ""; }} />
      <p className="mt-3 text-xs text-muted">PDF, JPG, PNG or WEBP · up to 10 MB · PDFs up to 20 pages</p>
      {reading ? <div role="status" className="mt-4 rounded-md bg-brand-50 p-3 text-sm"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />{status}
        <div className="mt-2 h-2 rounded-full bg-white"><div className="h-2 rounded-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} /></div>
        <Button type="button" variant="outline" className="mt-3" onClick={reset}>Stop</Button></div> : null}
      {error ? <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
    </Card> : null}

    {draft && file ? <>
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-xl font-bold">Read from {file.name}</h2><p className="text-sm text-muted">Check these against the document, then complete and save below.</p></div>
          <Button type="button" variant="outline" onClick={reset}><RotateCcw className="h-4 w-4" />Scan another</Button>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-brand-200 bg-brand-50 p-4 sm:grid-cols-3">
          {([["Supplier", draft.supplierName], ["Invoice date", ukDate(draft.issuedOn)], ["Invoice number", draft.number],
            ["Net (goods)", money(draft.summary.net, draft.currency)], ["VAT", money(draft.summary.vat, draft.currency)], ["Gross total", money(draft.summary.gross, draft.currency)]] as [string, string][])
            .map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs font-medium text-muted">{label}</dt>
              <dd className={`mt-0.5 break-words tabular-nums ${value ? "font-semibold" : "text-sm text-amber-800"}`}>{value || "Not found — enter below"}</dd></div>)}
          <div className="col-span-2 min-w-0 sm:col-span-3"><dt className="text-xs font-medium text-muted">Supplier VAT number</dt>
            <dd className="mt-0.5 flex flex-wrap items-center gap-3"><span className={draft.supplierVatNumber ? "font-semibold" : "text-sm text-amber-800"}>{draft.supplierVatNumber || "Not found on the document"}</span>
              {/^\d{9}(?:\d{3})?$/.test(vatDigits) ? <a href={HMRC_VAT_CHECK} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 underline"
                onClick={() => { void navigator.clipboard?.writeText(vatDigits).then(() => setCopied(true), () => undefined); }}><ExternalLink className="h-3.5 w-3.5" />Check with HMRC</a> : null}
              {copied ? <span className="text-xs text-muted">Number copied — paste it into HMRC&apos;s checker.</span> : null}</dd></div>
        </dl>
        {draft.warnings.length ? <ul className="mt-3 grid gap-2">{draft.warnings.map(w => <li key={w} className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{w}</li>)}</ul> : null}
      </Card>
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <Card className="min-w-0 overflow-hidden p-2">{file.type === "application/pdf"
          ? <iframe title="Uploaded invoice" src={preview} className="h-[70vh] w-full rounded" />
          : <img src={preview} alt="Uploaded invoice" className="max-h-[70vh] w-full rounded object-contain" />}</Card>
        <ManualInvoiceWorkspace key={companyId + file.name + file.lastModified} companyId={companyId} path="/app/invoices/new" capturedDraft={draft} />
      </div>
    </> : null}
  </div>;
}
