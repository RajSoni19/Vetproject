"use client";
import { maxDocumentPages, validateDocumentSignature } from "@/lib/document-validation";
import { layoutPositionedText, mergeImageOcr, normalizeDocumentText, pdfTextNeedsImageOcr } from "@/lib/document-text-layout";
import { flattenLighting } from "@/lib/ocr-image";

type Progress = (message: string, percent: number) => void;
const maxPixels = 9000000;
// Images (screenshots, scans, phone photos) are enlarged before OCR: below
// roughly 3000px on the long side Tesseract misreads small digits on a photo
// of an A4 page ("154.99" as "164.99", decimal points dropped).
const ocrTargetLongSide = 3400, ocrUpscaleBelow = 3000, ocrMaxUpscale = 3;

export function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(new Error("Reading stopped. Retry extraction or enter details manually.")); };
    const cleanup = () => signal.removeEventListener("abort", abort);
    if (signal.aborted) { void promise.catch(() => undefined); abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    promise.then((value) => { cleanup(); resolve(value); }, (error) => { cleanup(); reject(error); });
  });
}

function preprocess(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser cannot render the document for OCR.");
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  // Even out shadows and uneven light from phone photos: black text on white.
  flattenLighting(pixels.data, canvas.width, canvas.height);
  context.putImageData(pixels, 0, 0);
  return canvas;
}

export async function extractDocumentText(file: File, signal: AbortSignal, progress: Progress) {
  validateDocumentSignature(file.type, file.size, new Uint8Array(await abortable(file.slice(0, 1024).arrayBuffer(), signal)));
  let worker: Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>> | undefined;
  const stopWorker = () => { if (worker) void worker.terminate().catch(() => undefined); };
  signal.addEventListener("abort", stopWorker, { once: true });
  const recognize = async (canvas: HTMLCanvasElement) => {
    if (!worker) {
      const { createWorker, PSM } = await abortable(import("tesseract.js"), signal);
      const pending = createWorker("eng", 1, { workerPath: "/ocr/worker.min.js", corePath: "/ocr/tesseract-core-lstm.wasm.js", langPath: "/ocr", cacheMethod: "none", workerBlobURL: false, logger: ({ status, progress: amount }) => { if (!signal.aborted) progress(`OCR: ${status}`, 15 + Math.round(amount * 60)); } });
      pending.then((created) => { if (signal.aborted) void created.terminate().catch(() => undefined); }, () => undefined);
      worker = await abortable(pending, signal);
      // One uniform block keeps each printed row on one text line across the full
      // page width; preserved spacing keeps the gap between columns.
      await abortable(worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: "1" }), signal);
    }
    return normalizeDocumentText((await abortable(worker.recognize(preprocess(canvas)), signal)).data.text, true);
  };
  try {
    if (file.type !== "application/pdf") {
      progress("Rendering image", 10);
      const pendingBitmap = createImageBitmap(file);
      void pendingBitmap.then((bitmap) => { if (signal.aborted) bitmap.close(); }, () => undefined);
      const bitmap = await abortable(pendingBitmap, signal);
      try {
        const longSide = Math.max(bitmap.width, bitmap.height);
        const enlarge = longSide < ocrUpscaleBelow ? Math.min(ocrMaxUpscale, ocrTargetLongSide / longSide) : 1;
        const scale = Math.min(enlarge, Math.sqrt(maxPixels / (bitmap.width * bitmap.height)));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.floor(bitmap.width * scale));
        canvas.height = Math.max(1, Math.floor(bitmap.height * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Image rendering is unavailable.");
        context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
        context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        try { return await recognize(canvas); } finally { canvas.width = canvas.height = 0; }
      } finally { bitmap.close(); }
    }
    const pdfjs = await abortable(import("pdfjs-dist/legacy/build/pdf.mjs"), signal);
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString();
    const loading = pdfjs.getDocument({ data: new Uint8Array(await abortable(file.arrayBuffer(), signal)) });
    const stopPdf = () => { void loading.destroy().catch(() => undefined); };
    signal.addEventListener("abort", stopPdf, { once: true });
    try {
      const pdf = await abortable(loading.promise, signal);
      if (pdf.numPages > maxDocumentPages) throw new Error(`This local extraction supports up to ${maxDocumentPages} PDF pages. Split the document or enter it manually.`);
      const pages: string[] = [];
      for (let number = 1; number <= pdf.numPages; number++) {
        progress(`Reading PDF page ${number} of ${pdf.numPages}`, Math.round(10 + 70 * (number - 1) / pdf.numPages));
        const page = await abortable(pdf.getPage(number), signal);
        const content = await abortable(page.getTextContent(), signal);
        let text = normalizeDocumentText(layoutPositionedText(content.items.flatMap((item) => "str" in item ? [{ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: item.height || Math.abs(item.transform[3]) }] : [])));
        const scanned = text.replace(/[^a-z0-9]/gi, "").length < 40 || !/\b(invoice|subtotal|total|vat|quotation|receipt)\b/i.test(text);
        // Mixed pages: real text for the item lines, but the letterhead (logo,
        // VAT number) or totals box is a picture. OCR the page and add what the
        // text layer lacks; the text layer stays authoritative for amounts.
        let mixed = false;
        if (!scanned && pdfTextNeedsImageOcr(text)) {
          const operators = await abortable(page.getOperatorList(), signal);
          mixed = operators.fnArray.some((fn: number) => fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintInlineImageXObject || fn === pdfjs.OPS.paintImageMaskXObject);
        }
        if (scanned || mixed) {
          progress(mixed ? `Reading the letterhead image on page ${number}` : `OCR page ${number}`, Math.round(10 + 70 * (number - 0.5) / pdf.numPages));
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: Math.min(3, Math.sqrt(maxPixels / (base.width * base.height))) });
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.floor(viewport.width)); canvas.height = Math.max(1, Math.floor(viewport.height));
          const context = canvas.getContext("2d");
          if (!context) throw new Error("PDF rendering is unavailable.");
          const render = page.render({ canvas, canvasContext: context, viewport });
          const cancelRender = () => render.cancel();
          signal.addEventListener("abort", cancelRender, { once: true });
          try {
            await abortable(render.promise, signal);
            const ocr = await recognize(canvas);
            text = mixed ? mergeImageOcr(text, ocr) : ocr || text;
          }
          finally { signal.removeEventListener("abort", cancelRender); canvas.width = canvas.height = 0; }
        }
        pages.push(text); page.cleanup();
      }
      return normalizeDocumentText(pages.join("\n"));
    } finally { signal.removeEventListener("abort", stopPdf); await loading.destroy().catch(() => undefined); }
  } catch (error) {
    if (error instanceof Error && /password/i.test(error.name + error.message)) throw new Error("This PDF is encrypted. Upload an unlocked copy or enter the invoice manually.");
    throw error;
  } finally { signal.removeEventListener("abort", stopWorker); if (worker) await worker.terminate().catch(() => undefined); }
}
