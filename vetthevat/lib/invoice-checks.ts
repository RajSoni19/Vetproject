// Checks shared by every way of reading an invoice (PDF text, AI, on-device OCR).
// Each returns a plain-English warning for the person reviewing, or null.

export const MAX_AI_PAGES = 10;
// Vercel rejects request bodies above 4.5 MB; this leaves room for form overhead.
export const MAX_AI_REQUEST_BYTES = 4200000;

export const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export const closeTo = (a: number, b: number, tolerance = 0.011) => Math.abs(a - b) <= tolerance;
const pounds = (value: number) => `£${value.toFixed(2)}`;

// The line total after its discount.
export const lineTotal = (quantity: number, unitPrice: number, discount = 0) => round2(round2(quantity * unitPrice) - discount);

// "Page 1 / 2", "Page 1 of 2": the printed page count.
export function printedPageCount(pageInfo: string | null | undefined) {
  const match = pageInfo?.match(/\bpage\s*\d{1,3}\s*(?:\/|of)\s*(\d{1,3})\b/i);
  return match ? Number(match[1]) : null;
}
export const pageInfoFromText = (text: string) => text.match(/\bpage\s*\d{1,3}\s*(?:\/|of)\s*\d{1,3}\b/i)?.[0] ?? null;

export function missingPageWarning(pageInfo: string | null | undefined, pagesSent: number | undefined) {
  const printed = printedPageCount(pageInfo);
  if (!printed || !pagesSent || printed <= pagesSent) return null;
  const next = pagesSent + 1;
  return `Page ${next} may be missing: the document says “${pageInfo}”. Use “Add next page” below.`;
}

export function dateWarning(iso: string | null | undefined, today: Date = new Date()) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = Date.parse(`${iso}T00:00:00Z`), day = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (!Number.isFinite(date)) return null;
  if (date > day + 86400000) return "Please check the date: it is in the future.";
  return date < day - 366 * 86400000 ? "Please check the date: it is more than a year old." : null;
}

// expected: what the lines say the document should total.
export function totalsWarning(expected: number, printedTotal: number | null, lineCount: number) {
  if (printedTotal === null || closeTo(expected, printedTotal, Math.max(0.05, 0.01 * lineCount))) return null;
  return `A page or item may be missing: the items come to ${pounds(expected)} but the document total is ${pounds(printedTotal)}.`;
}
