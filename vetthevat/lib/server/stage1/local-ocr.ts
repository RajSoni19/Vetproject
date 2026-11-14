import { resolve } from "node:path";
import { validateDocumentSignature } from "@/lib/document-validation";
import type { InvoiceMime } from "@/lib/server/stage1/documents";

// Development-only Tesseract adapter using bundled local English data. A worker
// thread is NOT a hostile-file sandbox; production needs an isolated worker
// service with OS memory/CPU/network limits and preflight decoding/inspection.
export function localImageOcr(workspace: string, environment: "development" | "test") {
  if (process.env.NODE_ENV === "production" || !["development", "test"].includes(environment)) throw new Error("Local OCR is development-only.");
  return async (bytes: Uint8Array, mime: InvoiceMime, signal: AbortSignal) => {
    signal.throwIfAborted(); validateDocumentSignature(mime, bytes.byteLength, bytes);
    if (mime === "application/pdf") throw new Error("Render a bounded PDF page before OCR.");
    const { createWorker } = await import("tesseract.js");
    let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
    let rejectAbort: ((error: Error) => void) | undefined;
    const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
    const stop = () => { if (worker) void worker.terminate().catch(() => {}); rejectAbort?.(new Error("OCR aborted.")); };
    signal.addEventListener("abort", stop, { once: true });
    try {
      signal.throwIfAborted();
      const pending = createWorker("eng", 1, {
        langPath: resolve(workspace, "public/ocr"), cacheMethod: "none",
        workerPath: resolve(workspace, "node_modules/tesseract.js/src/worker-script/node/index.js"),
        logger: () => {}, errorHandler: () => {}
      });
      void pending.then(created => { if (signal.aborted) void created.terminate().catch(() => {}); }, () => {});
      worker = await Promise.race([pending, aborted]);
      const result = await Promise.race([worker.recognize(Buffer.from(bytes)), aborted]);
      signal.throwIfAborted();
      if (result.data.text.length > 1000000) throw new Error("OCR output too large.");
      return result.data.text;
    } finally { signal.removeEventListener("abort", stop); if (worker) await worker.terminate().catch(() => {}); }
  };
}
