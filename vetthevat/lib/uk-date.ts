// UK date format (DD/MM/YYYY) for every date the app shows or exports. The database and the
// API keep ISO dates (2026-11-09); only what people read is converted.

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_STAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

/** True for "2026-11-09" or an ISO timestamp such as "2026-11-09T14:05:00Z". */
export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && (ISO_DAY.test(value) || ISO_STAMP.test(value));
}

/**
 * "2026-11-09" → "09/11/2026". Timestamps become "09/11/2026, 14:05" in UK time.
 * Anything that is not a date is returned unchanged, so it is safe on mixed values.
 */
export function ukDate(value: unknown, options: { time?: boolean } = {}): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string") {
    const day = ISO_DAY.exec(value);
    if (day) return `${day[3]}/${day[2]}/${day[1]}`;
    if (!ISO_STAMP.test(value)) return value;
  }
  const date = value instanceof Date ? value : new Date(value as string | number);
  if (Number.isNaN(date.getTime())) return String(value);
  const showTime = options.time ?? !(value instanceof Date);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric",
    ...(showTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "Europe/London"
  }).format(date);
}

/** Excel serial day number for an ISO date (Excel counts days from 30 Dec 1899). */
export function excelSerial(iso: string): number {
  return Math.round((Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86400000);
}

type Cell = { t?: string; v?: unknown; z?: string; w?: string };

/**
 * Turns every ISO date text cell in a SheetJS sheet into a real Excel date shown as
 * dd/mm/yyyy, so accountants see UK dates and can still sort and filter by date.
 */
export function ukDateCells(sheet: Record<string, unknown>): void {
  for (const [address, raw] of Object.entries(sheet)) {
    if (address.startsWith("!")) continue;
    const cell = raw as Cell;
    if (cell?.t === "s" && typeof cell.v === "string" && ISO_DAY.test(cell.v)) {
      cell.t = "n";
      cell.v = excelSerial(cell.v);
      cell.z = "dd/mm/yyyy";
      delete cell.w;
    }
  }
}

/** Applies ukDateCells to every sheet in a SheetJS workbook, just before it is written. */
export function ukWorkbook<T extends { Sheets: Record<string, Record<string, unknown>> }>(book: T): T {
  for (const sheet of Object.values(book.Sheets)) ukDateCells(sheet);
  return book;
}
