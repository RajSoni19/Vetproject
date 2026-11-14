"use client";
import { useId, useState } from "react";
import { DocumentViewer } from "@/components/document-viewer";
import type { StoredDocument } from "@/lib/domain";

export function InvoiceWorkbench({ document, children }: { document?: StoredDocument; children: React.ReactNode }) {
  const [view, setView] = useState("fields");
  const id = useId();
  return <div className="min-w-0">
    <div className="mb-4 flex rounded-lg border border-line bg-white p-1 xl:hidden" role="tablist" aria-label="Invoice workbench">
      {[ ["fields", "Review fields"], ["source", "Source document"] ].map(([key, label]) => <button key={key} id={`${id}-${key}-tab`} type="button" role="tab" aria-selected={view === key} aria-controls={`${id}-${key}`} tabIndex={view === key ? 0 : -1} onClick={() => setView(key)} onKeyDown={(event) => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); const next = event.key === "Home" ? "fields" : event.key === "End" ? "source" : view === "fields" ? "source" : "fields"; setView(next); window.document.getElementById(`${id}-${next}-tab`)?.focus(); } }} className={`min-h-11 flex-1 rounded-md px-3 text-sm font-semibold ${view === key ? "bg-brand-50 text-brand-800" : "text-muted"}`}>{label}</button>)}
    </div>
    <div className="grid items-start gap-6 xl:grid-cols-[0.85fr_1.15fr]">
      <section id={`${id}-source`} role="tabpanel" aria-labelledby={`${id}-source-tab`} className={`${view === "source" ? "block" : "hidden"} min-w-0 xl:block`}><DocumentViewer document={document}/></section>
      <section id={`${id}-fields`} role="tabpanel" aria-labelledby={`${id}-fields-tab`} className={`${view === "fields" ? "block" : "hidden"} min-w-0 xl:block`}>{children}</section>
    </div>
  </div>;
}
