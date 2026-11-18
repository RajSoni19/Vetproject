"use client";
import { maxDocumentPages, validateDocumentSignature } from "@/lib/document-validation";
import { layoutPositionedText, mergeImageOcr, normalizeDocumentText, pdfTextNeedsImageOcr } from "@/lib/document-text-layout";
import { flattenLighting, textRegion, type OcrWordBox } from "@/lib/ocr-image";
import { MAX_AI_PAGES, MAX_AI_REQUEST_BYTES } from "@/lib/invoice-checks";

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

function preprocess(canvas: HTMLCanvasElement, invertDark = false) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser cannot render the document for OCR.");
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  // Even out shadows and uneven light from phone photos: black text on white.
  flattenLighting(pixels.data, canvas.width, canvas.height, invertDark);
  context.putImageData(pixels, 0, 0);
  return canvas;
}

// Below this many source pixels of letter height, phone photos are misread
// (WhatsApp shrinks photos; a page shot from afar fills half the frame).
const smallTextPixels = 12;
export const SMALL_TEXT_NOTE = "The invoice is small in this photo, so some details may be missing or misread. For best results, take the photo close up so the invoice fills the screen, and upload the original photo or PDF rather than one sent through WhatsApp (WhatsApp shrinks pictures).";

type Recognized = { text: string; words: OcrWordBox[] };
function wordBoxes(data: unknown): OcrWordBox[] {
  const blocks = (data as { blocks?: { paragraphs: { lines: { words: { bbox: { x0: number; y0: number; x1: number; y1: number }; confidence: number; text: string }[] }[] }[] }[] | null }).blocks ?? [];
  return blocks.flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines.flatMap((line) => line.words.map((word) => ({ ...word.bbox, confidence: word.confidence, text: word.text })))));
}
function medianWordHeight(words: OcrWordBox[]) {
  const heights = words.filter((word) => word.confidence >= 55 && /[A-Za-z0-9]{2,}/.test(word.text)).map((word) => word.y1 - word.y0).sort((a, b) => a - b);
  return heights.length >= 8 ? heights[Math.floor(heights.length / 2)] : null;
}

// A PDF page with no usable text layer is a picture of a document.
const pageLooksScanned = (text: string) => text.replace(/[^a-z0-9]/gi, "").length < 40 || !/\b(invoice|subtotal|total|vat|quotation|receipt)\b/i.test(text);

async function openPdf(file: File, signal: AbortSignal) {
  const pdfjs = await abortable(import("pdfjs-dist/legacy/build/pdf.mjs"), signal);
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString();
  const loading = pdfjs.getDocument({ data: new Uint8Array(await abortable(file.arrayBuffer(), signal)) });
  try { return { loading, pdf: await abortable(loading.promise, signal) }; }
  catch (error) { await loading.destroy().catch(() => undefined); throw error; }
}

// Photos and scanned PDFs need reading; a PDF with a real text layer does not.
export async function documentNeedsReading(file: File, signal: AbortSignal) {
  validateDocumentSignature(file.type, file.size, new Uint8Array(await abortable(file.slice(0, 1024).arrayBuffer(), signal)));
  if (file.type !== "application/pdf") return true;
  const { loading, pdf } = await openPdf(file, signal);
  try {
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await abortable(pdf.getPage(number), signal), content = await abortable(page.getTextContent(), signal);
      const text = normalizeDocumentText(layoutPositionedText(content.items.flatMap((item) => "str" in item ? [{ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: item.height || Math.abs(item.transform[3]) }] : [])));
      page.cleanup();
      if (pageLooksScanned(text)) return true;
    }
    return false;
  } finally { await loading.destroy().catch(() => undefined); }
}

// Sizes tried for each page until all pages fit in one request.
const uploadSizes: readonly [number, number][] = [[2400, 0.85], [2000, 0.8], [1600, 0.75], [1280, 0.7], [1000, 0.65]];
type PageSource = { width: number; height: number; draw(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement): Promise<void> };
const newCanvas = (width: number, height: number) => { const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(width)); canvas.height = Math.max(1, Math.round(height)); return canvas; };
const jpeg = (canvas: HTMLCanvasElement, quality: number) => new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The page could not be prepared.")), "image/jpeg", quality));

// What is sent to the AI reader: PDFs as they are when they fit in one request,
// otherwise every page as a JPEG, sized so the whole invoice fits.
export async function preparePagesForUpload(files: readonly File[], signal: AbortSignal) {
  const limit = MAX_AI_REQUEST_BYTES - 40000, minimumPhotoBytes = 150000;
  const pdfs = files.filter((file) => file.type === "application/pdf"), photoCount = files.length - pdfs.length;
  const pdfBytes = pdfs.reduce((sum, file) => sum + file.size, 0);
  const sendPdfs = pdfs.length > 0 && (photoCount ? (limit - pdfBytes) / photoCount >= minimumPhotoBytes : pdfBytes <= limit);
  const sources: PageSource[] = [], cleanups: (() => void | Promise<void>)[] = [];
  let pageCount = 0;
  try {
    for (const file of files) {
      if (file.type !== "application/pdf") {
        const bitmap = await abortable(createImageBitmap(file), signal);
        cleanups.push(() => bitmap.close());
        sources.push({ width: bitmap.width, height: bitmap.height, draw: async (context, canvas) => context.drawImage(bitmap, 0, 0, canvas.width, canvas.height) });
        pageCount++;
        continue;
      }
      const { loading, pdf } = await openPdf(file, signal);
      cleanups.push(() => loading.destroy().catch(() => undefined));
      pageCount += pdf.numPages;
      if (pageCount > MAX_AI_PAGES) throw new Error("Too many pages to send together.");
      if (sendPdfs) continue;
      for (let number = 1; number <= pdf.numPages; number++) {
        const page = await abortable(pdf.getPage(number), signal), base = page.getViewport({ scale: 1 });
        sources.push({ width: base.width * 3, height: base.height * 3, draw: async (context, canvas) => { await abortable(page.render({ canvas, canvasContext: context, viewport: page.getViewport({ scale: canvas.width / base.width }) }).promise, signal); } });
      }
    }
    if (!pageCount || pageCount > MAX_AI_PAGES) throw new Error("Too many pages to send together.");
    const budget = sources.length ? Math.floor((limit - (sendPdfs ? pdfBytes : 0)) / sources.length) : 0, pages: Blob[] = sendPdfs ? [...pdfs] : [];
    for (const source of sources) {
      const scale = Math.min(1, uploadSizes[0][0] / Math.max(source.width, source.height));
      const master = newCanvas(source.width * scale, source.height * scale), context = master.getContext("2d");
      if (!context) throw new Error("Image rendering is unavailable.");
      context.fillStyle = "white"; context.fillRect(0, 0, master.width, master.height);
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
      await source.draw(context, master);
      let page: Blob | null = null;
      for (const [longSide, quality] of uploadSizes) {
        const shrink = Math.min(1, longSide / Math.max(master.width, master.height)), canvas = newCanvas(master.width * shrink, master.height * shrink), target = canvas.getContext("2d");
        if (!target) throw new Error("Image rendering is unavailable.");
        target.imageSmoothingEnabled = true; target.imageSmoothingQuality = "high";
        target.drawImage(master, 0, 0, canvas.width, canvas.height);
        const blob = await abortable(jpeg(canvas, quality), signal);
        canvas.width = canvas.height = 0;
        if (blob.size <= budget) { page = blob; break; }
      }
      master.width = master.height = 0;
      if (!page) throw new Error("This page is too large to send.");
      pages.push(page);
    }
    return { pages, pageCount };
  } finally { for (const cleanup of cleanups) await cleanup(); }
}

// notes: reading-quality advice for the person (added to the draft's warnings).
export async function extractDocumentText(file: File, signal: AbortSignal, progress: Progress, notes?: string[]) {
  validateDocumentSignature(file.type, file.size, new Uint8Array(await abortable(file.slice(0, 1024).arrayBuffer(), signal)));
  let worker: Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>> | undefined;
  const stopWorker = () => { if (worker) void worker.terminate().catch(() => undefined); };
  signal.addEventListener("abort", stopWorker, { once: true });
  // sparse: the supplementary reading (boxed and white-on-dark text, totals).
  let mode = "";
  const recognize = async (canvas: HTMLCanvasElement, sparse = false): Promise<Recognized> => {
    if (!worker) {
      const { createWorker, PSM } = await abortable(import("tesseract.js"), signal);
      const pending = createWorker("eng", 1, { workerPath: "/ocr/worker.min.js", corePath: "/ocr/tesseract-core-lstm.wasm.js", langPath: "/ocr", cacheMethod: "none", workerBlobURL: false, logger: ({ status, progress: amount }) => { if (!signal.aborted) progress(`OCR: ${status}`, 15 + Math.round(amount * 60)); } });
      pending.then((created) => { if (signal.aborted) void created.terminate().catch(() => undefined); }, () => undefined);
      worker = await abortable(pending, signal);
      // One uniform block keeps each printed row on one text line across the full
      // page width; preserved spacing keeps the gap between columns.
      await abortable(worker.setParameters({ preserve_interword_spaces: "1" }), signal);
      void PSM;
    }
    // Single block keeps each printed row on one line across the page; sparse finds scattered text in boxes.
    const want = sparse ? "11" : "6";
    if (mode !== want) { await abortable(worker.setParameters({ tessedit_pageseg_mode: want as never }), signal); mode = want; }
    const { data } = await abortable(worker.recognize(preprocess(canvas, sparse), {}, { text: true, blocks: true }), signal);
    return { text: normalizeDocumentText(data.text, true), words: wordBoxes(data) };
  };
  try {
    if (file.type !== "application/pdf") {
      progress("Rendering image", 10);
      const pendingBitmap = createImageBitmap(file);
      void pendingBitmap.then((bitmap) => { if (signal.aborted) bitmap.close(); }, () => undefined);
      const bitmap = await abortable(pendingBitmap, signal);
      try {
        // Draws the whole photo, or just the invoice area, enlarged for OCR.
        const render = (crop: { x: number; y: number; width: number; height: number } | null) => {
          const sourceWidth = crop ? crop.width : bitmap.width, sourceHeight = crop ? crop.height : bitmap.height;
          const longSide = Math.max(sourceWidth, sourceHeight);
          const enlarge = longSide < ocrUpscaleBelow ? Math.min(ocrMaxUpscale, ocrTargetLongSide / longSide) : 1;
          const scale = Math.min(enlarge, Math.sqrt(maxPixels / (sourceWidth * sourceHeight)));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.floor(sourceWidth * scale));
          canvas.height = Math.max(1, Math.floor(sourceHeight * scale));
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Image rendering is unavailable.");
          context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
          context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
          context.drawImage(bitmap, crop?.x ?? 0, crop?.y ?? 0, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
          return { canvas, scale };
        };
        const first = render(null);
        let result: Recognized, scale = first.scale, finalCrop: { x: number; y: number; width: number; height: number } | null = null;
        try { result = await recognize(first.canvas); } finally { first.canvas.width = first.canvas.height = 0; }
        // Photo taken from a distance (page on a desk): crop to the invoice and read it again, larger.
        const region = textRegion(result.words, Math.floor(bitmap.width * first.scale), Math.floor(bitmap.height * first.scale));
        if (region) {
          const crop = { x: Math.floor(region.x / first.scale), y: Math.floor(region.y / first.scale), width: Math.max(1, Math.floor(region.width / first.scale)), height: Math.max(1, Math.floor(region.height / first.scale)) };
          const second = render(crop);
          if (second.scale > first.scale * 1.15) {
            progress("Reading the invoice closer", 80);
            try { const closer = await recognize(second.canvas); if (closer.text.replace(/\s/g, "").length >= result.text.replace(/\s/g, "").length * 0.6) { result = closer; scale = second.scale; finalCrop = crop; } }
            finally { second.canvas.width = second.canvas.height = 0; }
          } else second.canvas.width = second.canvas.height = 0;
        }
        const height = medianWordHeight(result.words);
        if (notes && height !== null && height / scale < smallTextPixels) notes.push(SMALL_TEXT_NOTE);
        // Supplementary reading for totals in ruled boxes or white-on-dark bars.
        // Appended after a form feed; the parser uses it only to fill gaps.
        progress("Checking the totals", 90);
        const extra = render(finalCrop);
        try { const sparse = await recognize(extra.canvas, true); if (sparse.text.trim()) return `${result.text}\n\f\n${sparse.text}`; }
        catch (error) { if (signal.aborted) throw error; }
        finally { extra.canvas.width = extra.canvas.height = 0; }
        return result.text;
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
        const scanned = pageLooksScanned(text);
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
            const ocr = (await recognize(canvas)).text;
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
