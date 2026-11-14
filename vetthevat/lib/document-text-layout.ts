// Turns positioned text into one line per visual row, with a tab wherever
// there is a column gap. lib/invoice-text-extraction.ts relies on those tabs
// to keep "Bill To" apart from "Invoice Date  26/10/2026" on the same row.

export type PositionedText = { str: string; x: number; y: number; width: number; height: number };

// PDF text arrives in the order it was drawn, which is often not reading
// order (totals first, header last). Rebuild rows top-to-bottom by position.
export function layoutPositionedText(items: PositionedText[]): string {
  const usable = items.filter((item) => item.str.trim() && [item.x, item.y, item.width, item.height].every(Number.isFinite));
  const sorted = [...usable].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: { y: number; height: number; items: PositionedText[] }[] = [];
  for (const item of sorted) {
    const height = item.height > 0 ? item.height : 10;
    const row = rows.at(-1);
    if (row && Math.abs(row.y - item.y) <= Math.max(2, Math.min(row.height, height) * 0.45)) row.items.push(item);
    else rows.push({ y: item.y, height, items: [item] });
  }
  return rows.map((row) => {
    let line = "", end = 0, previous: PositionedText | undefined;
    for (const item of row.items.sort((a, b) => a.x - b.x)) {
      const text = item.str.replace(/\s+/g, " ").trim();
      if (!previous) { line = text; }
      else {
        const height = previous.height > 0 ? previous.height : 10;
        const charWidth = previous.width > 0 && previous.str.length ? previous.width / previous.str.length : height * 0.5;
        const gap = item.x - end;
        // The same run drawn twice (bold simulation) is one piece of text.
        if (gap < -charWidth && previous.str.trim() === text) continue;
        line += gap > Math.max(charWidth * 2.5, height * 0.9) ? `\t${text}` : gap > charWidth * 0.3 || /\s$/.test(previous.str) || /^\s/.test(item.str) ? ` ${text}` : text;
      }
      end = item.x + Math.max(0, item.width);
      previous = item;
    }
    return line;
  }).join("\n");
}

// Does a PDF page's own text lack the details that usually live in a scanned
// letterhead image? (supplier VAT number, supplier web/email, VAT amount)
export function pdfTextNeedsImageOcr(text: string) {
  const vatNumber = /v\.?\s?a\.?\s?t\.?\s*(?:reg(?:istration)?\.?\s*)?(?:no\.?|number|#)?\s*[:#\-–]?\s*(?:GB|XI)?\s?\d{3}\s?\d{3,4}\s?\d{2,3}/i.test(text);
  const vatAmount = /(?:^|\n|\t)\s*(?:total\s+)?vat(?:\s+amount|\s+total)?\s*[:\t ]\s*£?\s*\d[\d,]*\.\d{2}/i.test(text);
  const contact = /(?:@|www\.)[a-z0-9-]{3,}\.(?:co\.uk|com|uk|net|org)/i.test(text);
  return !vatNumber || !vatAmount || !contact;
}

// Lines from OCR of a page's images that the PDF text layer does not already
// carry. The text layer stays authoritative for amounts, invoice number and
// dates, so OCR lines with money or those labels are dropped, except
// self-describing VAT analysis rows ("20.00 % 475.46 95.09").
export function mergeImageOcr(pdfText: string, ocrText: string) {
  const key = (line: string) => line.toLowerCase().replace(/[^a-z0-9]/g, "");
  const known = new Set(pdfText.split("\n").map(key).filter(Boolean));
  const header: string[] = [], analysis: string[] = [];
  const triple = /(\d{1,2}(?:\.\d{1,2})?)\s*%\s*[|¦:\s\t]*£?\s*(\d[\d,]*\.\d{2})\s*[|¦:\s\t]*£?\s*(\d[\d,]*\.\d{2})/;
  const pdfTriples = new Set([...pdfText.matchAll(new RegExp(triple, "g"))].map(m => `${Number(m[1])}|${m[2]}|${m[3]}`));
  for (const line of normalizeDocumentText(ocrText, true).split("\n")) {
    const k = key(line);
    if (k.length < 3 || known.has(k)) continue;
    const vatRow = line.match(triple);
    if (vatRow) {
      // Only the rate / goods / VAT figures; anything else on the row (an OCR'd
      // "Invoice Total") must not compete with the PDF's own totals.
      const id = `${Number(vatRow[1])}|${vatRow[2]}|${vatRow[3]}`;
      if (!pdfTriples.has(id)) { pdfTriples.add(id); analysis.push(`${vatRow[1]}%\t${vatRow[2]}\t${vatRow[3]}`); }
      continue;
    }
    if (/\d[.,]\d{2}(?!\d)/.test(line)) continue;
    if (/\b(?:goods|total|sub\s*total|net|balance|amount|vat\s+analysis)\b/i.test(line) && !/v\.?\s?a\.?\s?[tl]\.?\s*(?:reg|no|number)/i.test(line)) continue;
    if (/\b(?:invoice\s*(?:no|number|#|date|to)|date|account\s*code|order\s*(?:no|number)|page|qty|quantity|code\b)/i.test(line) && !/v\.?\s?a\.?\s?[tl]\.?\s*(?:reg|no|number)/i.test(line)) continue;
    header.push(line);
  }
  if (!header.length && !analysis.length) return pdfText;
  return [header.join("\n"), pdfText, analysis.join("\n")].filter(Boolean).join("\n");
}

// Tidies extracted text without losing column gaps. With `ocr`, wide runs of
// spaces (Tesseract's preserve_interword_spaces) become tabs.
export function normalizeDocumentText(text: string, ocr = false): string {
  let value = text.replace(/\r/g, "").replace(/ /g, " ");
  if (ocr) value = value.replace(/ {3,}/g, "\t");
  return value.split("\n").map((line) => line.replace(/ +/g, " ").replace(/ ?\t[ \t]*/g, "\t").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
