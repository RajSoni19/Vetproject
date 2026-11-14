"use client";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useUnsavedChanges } from "@/components/navigation-guard";

export type RecordField = { name: string; label: string; required?: boolean; type?: string; options?: string[]; vatCheck?: boolean };
export function RecordFormDialog({ title, fields, values, onSave, onClose, note, saveLabel = "Save locally" }: { title: string; fields: RecordField[]; values: Record<string, string>; onSave: (values: Record<string, string>) => void; onClose: () => void; note?: string; saveLabel?: string }) {
  const [draft, setDraft] = useState(values);
  const [error, setError] = useState("");
  const initial = useRef(JSON.stringify(values));
  const guard = useUnsavedChanges(JSON.stringify(draft) !== initial.current);
  const dismiss = () => { if (guard.allowLeave()) { guard.clear(); onClose(); } };
  const overlay = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = dismiss;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const controls = () => Array.from(overlay.current?.querySelectorAll<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href]') ?? []);
    controls()[0]?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); }
      if (event.key === "Tab") {
        const items = controls(), first = items[0], last = items[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || !overlay.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !overlay.current?.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => { window.removeEventListener("keydown", keyboard); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div ref={overlay} className="fixed inset-0 z-50 grid place-items-center overflow-auto bg-ink/40 p-4" onClick={(event) => { if (event.target === event.currentTarget) dismiss(); }}><Card className="my-4 max-h-[90vh] w-full max-w-xl overflow-auto p-6" role="dialog" aria-modal="true" aria-label={title}>
    <h2 className="text-xl font-bold">{title}</h2>{note ? <p className="mt-2 text-sm text-muted">{note}</p> : null}
    <form className="mt-5 grid gap-4" onSubmit={(event) => { event.preventDefault(); try { onSave(draft); guard.clear(); onClose(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Changes were not saved."); } }}>
      {fields.map((field) => <label key={field.name} className="grid gap-2 text-sm font-semibold">{field.label}{field.options ? <select className="h-11 rounded-md border border-line px-3" value={draft[field.name] ?? ""} onChange={(event) => setDraft({ ...draft, [field.name]: event.target.value })}>{field.options.map((option) => <option key={option}>{option}</option>)}</select> : <input required={field.required} type={field.type ?? "text"} maxLength={200} className="h-11 rounded-md border border-line px-3" value={draft[field.name] ?? ""} onChange={(event) => setDraft({ ...draft, [field.name]: event.target.value })} />}</label>)}
      {error ? <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      {fields.some(field=>field.vatCheck)?<div className="rounded-lg border border-line bg-wash p-4 text-sm"><a href="https://www.gov.uk/check-uk-vat-number" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-semibold text-brand-700">Check VAT number on GOV.UK (opens a new tab)</a><p className="mt-2 text-xs leading-5 text-muted">Use the VAT number entered above. This manual check does not automatically mark the supplier verified. Automatic HMRC checks require an approved server integration.</p><Button type="button" className="mt-3" variant="outline" disabled aria-describedby="automatic-vat-unavailable">Automatic HMRC verification unavailable</Button><p id="automatic-vat-unavailable" className="mt-2 text-xs text-muted">HMRC API credentials and authenticated backend access are not configured.</p></div>:null}
      <div className="flex gap-3"><Button type="submit">{saveLabel}</Button><Button type="button" variant="outline" onClick={dismiss}>Cancel</Button></div>
    </form>
  </Card></div>;
}
