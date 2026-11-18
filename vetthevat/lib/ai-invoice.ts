// The structured invoice the AI reader returns. Shared by the server route and
// the browser, so this file must stay free of server-only imports and secrets.
// Every value is either copied from the document or null; arithmetic and the
// checks happen in our own code (lib/captured-invoice-draft, lib/invoice-checks).

export type AiInvoiceLine = {
  description: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  discount: number | null;
  offer_price: number | null;
  amount: number | null;
  vat_rate: number | null;
  vat_code: string | null;
};
export type AiVatSummaryRow = { code: string | null; rate: number | null; goods: number | null; vat: number | null };
export type AiInvoice = {
  document_type: "invoice" | "receipt";
  supplier_name: string | null;
  customer_name: string | null;
  vat_number: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  prices_include_vat: boolean;
  lines: AiInvoiceLine[];
  vat_summary: AiVatSummaryRow[];
  subtotal: number | null;
  net_total: number | null;
  vat_total: number | null;
  gross_total: number | null;
  page_info: string | null;
};
export type AiUsage = { promptTokens: number | null; outputTokens: number | null; thinkingTokens: number | null; totalTokens: number | null };

export const AI_INVOICE_PROMPT = `These pages are ONE UK supplier invoice or till receipt. Extract it.
The supplier is the business that issued the document and is being paid. It is never the "Bill to", "Invoice to", "Ship to" or customer party; put that party in customer_name.
Dates are UK format DD/MM/YYYY; return them as YYYY-MM-DD.
Copy every number exactly as printed. If a value is not printed or is unreadable, use null.
Never calculate, infer or guess a value that is not on the page.
Return one entry in lines for each item, in printed order, joining a description that wraps onto several rows. A quantity printed before the name belongs in quantity, not in description.
amount is the line amount as printed, before any discount shown beneath the item.
Lines under an item belong to that item and are never separate lines. unit_price is the normal price each (e.g. '£15.00 each'). offer_price is a member or offer price each (e.g. 'Cc £12.00' means 12.00); it is NOT a discount. discount is only the money taken off, printed as a minus amount (e.g. '-£6.00' means 6.00).
vat_rate is the percentage printed on the line. vat_code is a VAT letter printed on the line (e.g. A, B, S, Z). Copy any VAT rate table into vat_summary.
subtotal, net_total and vat_total must each be a figure actually printed with its own label; never work them out from other figures, and use null if not printed. subtotal is the figure printed as Subtotal. net_total is the goods total excluding VAT. gross_total is the final amount to pay (Total, Please pay, Balance due).
prices_include_vat is true for till receipts, and for an invoice only if it states that its prices include VAT. Otherwise it is false.
VAT: if no VAT number or VAT amount is shown, set vat_number and vat_total to null.
page_info is the page marking exactly as printed (e.g. "Page 1 / 2"), or null.`;

const text = { type: ["string", "null"] };
const money = { type: ["number", "null"] };
export const AI_INVOICE_JSON_SCHEMA = {
  type: "object",
  properties: {
    document_type: { type: "string", enum: ["invoice", "receipt"] },
    supplier_name: text, customer_name: text, vat_number: text, invoice_number: text,
    invoice_date: { ...text, description: "YYYY-MM-DD" }, due_date: { ...text, description: "YYYY-MM-DD" },
    prices_include_vat: { type: "boolean" },
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: { description: { type: "string" }, quantity: money, unit: text, unit_price: money, discount: money, offer_price: money, amount: money, vat_rate: money, vat_code: text },
        required: ["description", "quantity", "unit", "unit_price", "discount", "offer_price", "amount", "vat_rate", "vat_code"]
      }
    },
    vat_summary: {
      type: "array",
      items: { type: "object", properties: { code: text, rate: money, goods: money, vat: money }, required: ["code", "rate", "goods", "vat"] }
    },
    subtotal: money, net_total: money, vat_total: money, gross_total: money, page_info: text
  },
  required: ["document_type", "supplier_name", "customer_name", "vat_number", "invoice_number", "invoice_date", "due_date", "prices_include_vat", "lines", "vat_summary", "subtotal", "net_total", "vat_total", "gross_total", "page_info"]
} as const;

const MAX_LINES = 500;
const textValue = (value: unknown, max = 300) => {
  if (typeof value !== "string") return null;
  const clean = value.replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, max) : null;
};
const numberValue = (value: unknown) => typeof value === "number" && Number.isFinite(value) && Math.abs(value) < 1e10 ? value : null;
const positive = (value: unknown) => { const number = numberValue(value); return number === null ? null : Math.abs(number); };
function dateValue(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}
const record = (value: unknown): Record<string, unknown> | null => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;

// Model output is untrusted: keep only well-formed values, or reject it entirely
// when it is not an invoice object at all.
export function parseAiInvoice(value: unknown): AiInvoice {
  const source = record(value);
  if (!source || !Array.isArray(source.lines)) throw new Error("The reader did not return an invoice.");
  const lines = source.lines.slice(0, MAX_LINES).flatMap((raw): AiInvoiceLine[] => {
    const line = record(raw), description = line && textValue(line.description, 2000);
    if (!line || !description) return [];
    return [{ description, quantity: positive(line.quantity) || null, unit: textValue(line.unit, 20), unit_price: positive(line.unit_price), discount: positive(line.discount), offer_price: positive(line.offer_price), amount: numberValue(line.amount), vat_rate: positive(line.vat_rate), vat_code: textValue(line.vat_code, 4) }];
  });
  const vatSummary = (Array.isArray(source.vat_summary) ? source.vat_summary : []).slice(0, 10).flatMap((raw): AiVatSummaryRow[] => {
    const row = record(raw);
    return row ? [{ code: textValue(row.code, 4), rate: positive(row.rate), goods: numberValue(row.goods), vat: numberValue(row.vat) }] : [];
  });
  return {
    document_type: source.document_type === "receipt" ? "receipt" : "invoice",
    supplier_name: textValue(source.supplier_name, 200), customer_name: textValue(source.customer_name, 200),
    vat_number: textValue(source.vat_number, 30), invoice_number: textValue(source.invoice_number, 100),
    invoice_date: dateValue(source.invoice_date), due_date: dateValue(source.due_date),
    prices_include_vat: source.prices_include_vat === true, lines, vat_summary: vatSummary,
    subtotal: numberValue(source.subtotal), net_total: numberValue(source.net_total), vat_total: numberValue(source.vat_total), gross_total: numberValue(source.gross_total),
    page_info: textValue(source.page_info, 40)
  };
}
