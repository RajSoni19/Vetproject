// Lazy PDF.js digital-text adapter. Scanned-PDF rasterization remains an explicit
// sandbox adapter; never substitutes empty text or a fabricated invoice.
export async function digitalPdf(bytes: Uint8Array, signal: AbortSignal) {
  signal.throwIfAborted();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loading = pdfjs.getDocument({ data: Uint8Array.from(bytes), useSystemFonts: false, useWorkerFetch: false, stopAtErrors: true });
  const abort = () => { void loading.destroy().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    const pdf = await loading.promise;
    if (pdf.numPages > 20) throw new Error("PDF page limit exceeded.");
    const textByPage: string[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      signal.throwIfAborted();
      const page = await pdf.getPage(number), content = await page.getTextContent();
      let text = "", previousY: number | undefined;
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const y = item.transform[5];
        if (previousY !== undefined && Math.abs(previousY - y) > 2) text += "\n";
        text += item.str + (item.hasEOL ? "\n" : " "); previousY = y;
        if (text.length > 1000000) throw new Error("PDF text limit exceeded.");
      }
      textByPage.push(text); page.cleanup();
    }
    return { pages: pdf.numPages, textByPage };
  } finally { signal.removeEventListener("abort", abort); await loading.destroy(); }
}
