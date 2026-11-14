"use client";
import { useState } from "react";
import type { StoredDocument } from "@/lib/domain";
import { useAppState } from "@/components/app-state";
import { validateDocumentSignature } from "@/lib/document-validation";
import { Card } from "@/components/ui/card";

export function DocumentSessionRestore({ document }: { document: StoredDocument }) {
  const { updateDocument } = useAppState();
  const [error, setError] = useState(""); const [reading, setReading] = useState(false);
  async function restore(file?: File) {
    if (!file) return; setReading(true); setError(""); let url: string | undefined;
    try {
      validateDocumentSignature(file.type, file.size, new Uint8Array(await file.slice(0, 1024).arrayBuffer()));
      if (file.name !== document.fileName || file.type !== document.mimeType || document.byteSize !== undefined && file.size !== document.byteSize) throw new Error("Choose the matching original filename, type and size.");
      const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
      const checksum = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
      if (document.sha256Hash && checksum !== document.sha256Hash) throw new Error("This file does not match the stored original checksum. The record was not changed.");
      url = URL.createObjectURL(file);
      updateDocument({ ...document, localPreviewUrl: url });
    } catch (reason) { if (url) URL.revokeObjectURL(url); setError(reason instanceof Error ? reason.message : "Preview could not be restored."); }
    finally { setReading(false); }
  }
  return <Card className="p-5"><h2 className="text-lg font-bold">Attach original for this session</h2><p className="mt-2 text-sm text-muted">Select your matching file to restore its temporary preview. No file bytes are stored permanently.{document.sha256Hash ? " The stored checksum must match." : " This legacy record has no checksum; filename/type matching alone cannot prove that the file is the original."}</p><label className="mt-4 grid gap-2 text-sm font-semibold">Matching original<input disabled={reading} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void restore(file); }} /></label>{reading ? <p role="status" className="mt-3 text-sm">Checking file…</p> : null}{error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}</Card>;
}
