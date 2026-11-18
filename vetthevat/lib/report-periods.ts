// Calendar periods for report downloads, as inclusive ISO date ranges.
export type PeriodType = "month" | "quarter" | "year" | "custom";
export type DateRange = { startsOn: string; endsOn: string; label: string };

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const QUARTER_NAMES = ["Q1 (Jan–Mar)", "Q2 (Apr–Jun)", "Q3 (Jul–Sep)", "Q4 (Oct–Dec)"];

const iso = (year: number, month: number, day: number) => new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);

// part: month 0-11, or quarter 0-3. Ignored for a year.
export function periodRange(type: Exclude<PeriodType, "custom">, year: number, part = 0): DateRange {
  if (type === "year") return { startsOn: iso(year, 0, 1), endsOn: iso(year, 11, 31), label: String(year) };
  if (type === "quarter") return { startsOn: iso(year, part * 3, 1), endsOn: iso(year, part * 3 + 3, 0), label: `Q${part + 1}-${year}` };
  return { startsOn: iso(year, part, 1), endsOn: iso(year, part + 1, 0), label: `${MONTH_NAMES[part].slice(0, 3)}-${year}` };
}

// Years to offer: every year with an invoice, plus the current one, newest first.
export function periodYears(dates: readonly unknown[], today: Date = new Date()) {
  const years = new Set([today.getUTCFullYear()]);
  for (const date of dates) { const year = Number(String(date ?? "").slice(0, 4)); if (year >= 2000 && year <= 2100) years.add(year); }
  return [...years].sort((a, b) => b - a);
}
