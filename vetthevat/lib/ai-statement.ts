// A bank statement read by the AI reader from a photo or PDF. Shared by the
// server route and the browser, so no server-only imports or secrets here.
// Every value is copied from the statement or null; matching happens in our own
// code (lib/bank-matching).

export type AiStatementRow = { date: string | null; description: string | null; paid_out: number | null; paid_in: number | null };
export type AiStatement = { rows: AiStatementRow[] };

export const AI_STATEMENT_PROMPT = `These pages are ONE UK bank statement (or a photo or screenshot of bank transactions). List every transaction row.
For each row return: date as YYYY-MM-DD (UK statements are DD/MM/YYYY), description exactly as printed (payee or reference), paid_out for money leaving the account, paid_in for money coming in.
Amounts are positive numbers copied exactly as printed, without currency symbols. Use null for the column that is empty.
Skip balance rows, opening and closing balances, totals and headers. Do not invent rows. If a value is unreadable use null.`;

export const AI_STATEMENT_JSON_SCHEMA = {
  type: "object",
  properties: {
    rows: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: { type: ["string", "null"], description: "YYYY-MM-DD" },
          description: { type: ["string", "null"] },
          paid_out: { type: ["number", "null"] },
          paid_in: { type: ["number", "null"] }
        },
        required: ["date", "description", "paid_out", "paid_in"]
      }
    }
  },
  required: ["rows"]
} as const;

const amount = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 10_000_000 ? Math.round(value * 100) / 100 : null;
const text = (value: unknown, max: number) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

// Validates the reader's answer; drops rows with no usable date or amount.
export function parseAiStatement(value: unknown): AiStatement {
  if (!value || typeof value !== "object" || !Array.isArray((value as { rows?: unknown }).rows)) throw new Error("Invalid statement reading.");
  const rows = ((value as { rows: unknown[] }).rows).slice(0, 2000).flatMap((raw): AiStatementRow[] => {
    if (!raw || typeof raw !== "object") return [];
    const row = raw as Record<string, unknown>;
    const date = typeof row.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? row.date : null;
    const parsed = { date, description: text(row.description, 300), paid_out: amount(row.paid_out), paid_in: amount(row.paid_in) };
    return parsed.date && (parsed.paid_out || parsed.paid_in) ? [parsed] : [];
  });
  return { rows };
}

// Rows in the column layout lib/bank-matching's parseStatementRows reads.
export function statementTable(statement: AiStatement): unknown[][] {
  return [["Date", "Description", "Paid out", "Paid in"], ...statement.rows.map((row) => [row.date, row.description ?? "", row.paid_out ?? "", row.paid_in ?? ""])];
}
