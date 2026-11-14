"use client";

import { Download, ExternalLink, Maximize2, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { StoredDocument } from "@/lib/domain";
import { Button, ButtonLink } from "@/components/ui/button";


export function DocumentViewer({ document }: { document?: StoredDocument }) {
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const [availableUrl, setAvailableUrl] = useState<string>();
  const originalUrl = document?.localPreviewUrl;
  useEffect(() => {
    setAvailableUrl(undefined);
    if (!originalUrl || !originalUrl.startsWith("blob:")) return;
    const controller = new AbortController();
    void fetch(originalUrl, { signal: controller.signal }).then(async (response) => {
      await response.body?.cancel();
      if (response.ok && !controller.signal.aborted) setAvailableUrl(originalUrl);
    }).catch(() => undefined);
    return () => controller.abort();
  }, [originalUrl]);
  const previewUrl = availableUrl === originalUrl ? availableUrl : undefined;

  if (!document) return <div className="rounded-lg border border-line bg-white p-6"><h2 className="text-lg font-bold">No original attached</h2><p className="mt-2 text-sm text-muted">Manual invoices can be created without a document. No sample document is displayed.</p></div>;

  return (
    <div ref={container} className="overflow-hidden rounded-lg border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-3">
        <div>
          <p className="text-sm font-bold">{document?.fileName ?? "Uploaded supplier invoice"}</p>
          <p className="text-xs text-muted">{document.fileType} preview - local upload session only</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="h-9 px-3" onClick={() => setZoom((value) => Math.max(60, value - 10))} aria-label="Zoom out"><ZoomOut className="h-4 w-4" /></Button>
          <Button type="button" variant="outline" className="h-9 px-3" onClick={() => setZoom((value) => Math.min(150, value + 10))} aria-label="Zoom in"><ZoomIn className="h-4 w-4" /></Button>
          <Button type="button" variant="outline" className="h-9 px-3" onClick={() => setRotation((value) => (value + 90) % 360)} aria-label="Rotate"><RotateCw className="h-4 w-4" /></Button>
          <Button type="button" variant="outline" className="h-9 px-3" aria-label="Fullscreen" disabled={!previewUrl} onClick={() => { if (window.document.fullscreenElement) void window.document.exitFullscreen().catch(() => undefined); else if (container.current?.requestFullscreen) void container.current.requestFullscreen().catch(() => { if (previewUrl) window.open(previewUrl, "_blank", "noopener,noreferrer"); }); else if (previewUrl) window.open(previewUrl, "_blank", "noopener,noreferrer"); }}><Maximize2 className="h-4 w-4" /></Button>
          <Button type="button" variant="outline" className="h-9 px-3" aria-label="Download" disabled={!previewUrl} onClick={() => { if (!previewUrl) return; const link = window.document.createElement("a"); link.href = previewUrl; link.download = document.fileName; link.click(); }}><Download className="h-4 w-4" /></Button>
          <Button type="button" variant="outline" className="h-9 px-3" aria-label="Open document" disabled={!previewUrl} onClick={() => { if (previewUrl) window.open(previewUrl, "_blank", "noopener,noreferrer"); }}><ExternalLink className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="grid min-h-[360px] sm:min-h-[520px] place-items-center overflow-auto bg-[#eef4f1] p-5">
        <div
          className={previewUrl ? "h-[520px] w-full origin-center bg-white transition" : "w-[420px] max-w-full origin-center rounded-md bg-white p-5 shadow-soft transition"}
          style={{ transform: `scale(${zoom / 100}) rotate(${rotation}deg)` }}
        >
          {previewUrl ? (
            document.fileType === "PDF" ? (
              <iframe src={previewUrl} title={`Preview of ${document.fileName}`} className="h-full w-full border-0" />
            ) : (
              <img src={previewUrl} alt={`Preview of ${document.fileName}`} className="h-full w-full object-contain" />
            )
          ) : (
            <div className="grid min-h-[360px] place-items-center text-center">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-muted">{document.fileType} uploaded</p>
                <h3 className="mt-3 break-words text-xl font-bold">Original preview unavailable</h3>
                <p className="mt-4 text-sm leading-6 text-muted">Invoice metadata is saved in this browser only. The original file is available only during the upload session; permanent private document storage is not connected. Upload the original again to view it.</p>
                <ButtonLink className="mt-4" variant="outline" href={`/app/documents/${document.id}`}>Restore original document</ButtonLink>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


