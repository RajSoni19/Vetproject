// Orders sent to suppliers from ORS (WhatsApp or email): shared types and
// strict validation of the body the browser sends. Totals are recomputed here,
// never trusted from the browser.
export type SupplierOrderLine = { name: string; quantity: number; unitPrice: number };
export type SupplierOrderStatus = "sent" | "delivered" | "cancelled";
export type SupplierOrder = {
  id: string; number: string; supplierId: string | null; supplierName: string; channel: "whatsapp" | "email";
  status: SupplierOrderStatus; lines: SupplierOrderLine[]; total: number; currency: string; createdAt: string; updatedAt: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function supplierOrderInput(value: unknown) {
  const fail = (message: string): never => { throw new SupplierOrderInputError(message); };
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("Order details are missing.");
  const v = value as Record<string, unknown>;
  const supplierName = typeof v.supplierName === "string" ? v.supplierName.trim() : "";
  if (!supplierName || supplierName.length > 200) fail("Supplier name is required.");
  const supplierId = v.supplierId == null || v.supplierId === "" ? null : typeof v.supplierId === "string" && UUID.test(v.supplierId) ? v.supplierId.toLowerCase() : fail("Supplier is not valid.");
  if (v.channel !== "whatsapp" && v.channel !== "email") fail("Choose WhatsApp or email.");
  const currency = typeof v.currency === "string" && /^[A-Z]{3}$/.test(v.currency) ? v.currency : fail("Currency is not valid.");
  if (!Array.isArray(v.lines) || v.lines.length < 1 || v.lines.length > 200) fail("An order needs 1 to 200 items.");
  const lines = (v.lines as unknown[]).map((raw): SupplierOrderLine => {
    const line = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const name = typeof line.name === "string" ? line.name.trim() : "";
    const quantity = Number(line.quantity), unitPrice = Number(line.unitPrice);
    if (!name || name.length > 300) fail("Each item needs a product name.");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) fail(`Quantity for ${name} must be 1 to 9999.`);
    if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 1_000_000) fail(`Price for ${name} is not valid.`);
    return { name, quantity, unitPrice: Math.round(unitPrice * 100) / 100 };
  });
  const total = Math.round(lines.reduce((sum, line) => sum + line.quantity * line.unitPrice * 100, 0)) / 100;
  return { supplierId, supplierName, channel: v.channel as "whatsapp" | "email", currency, lines, total };
}

export function supplierOrderStatusInput(value: unknown): SupplierOrderStatus {
  const status = value && typeof value === "object" ? (value as Record<string, unknown>).status : undefined;
  if (status !== "sent" && status !== "delivered" && status !== "cancelled") throw new SupplierOrderInputError("Status must be sent, delivered or cancelled.");
  return status;
}

export class SupplierOrderInputError extends Error {}

// WhatsApp text: a clear order summary that goes to the business's own WhatsApp number.
export function whatsappOrderMessage(order: { supplierName: string; lines: { quantity: number; name: string; unitPrice?: number }[]; total?: number; currency?: string }, companyName?: string, number?: string) {
  const money = (value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: order.currency ?? "GBP" }).format(value);
  const lines = order.lines.map(line => `- ${line.quantity} x ${line.name}`).join("\n");
  const total = order.total ?? order.lines.reduce((sum, line) => sum + line.quantity * (line.unitPrice ?? 0), 0);
  return `*New order${number ? ` ${number}` : ""}*\nSupplier: ${order.supplierName}${companyName ? `\nFor: ${companyName}` : ""}\n\n${lines}\n\nTotal: ${money(total)}`;
}
// UK numbers for wa.me: 07xxx becomes 447xxx.
export function whatsappNumber(phone: string | null) { const digits = (phone ?? "").replace(/\D/g, ""); return digits.startsWith("0") && !digits.startsWith("00") ? "44" + digits.slice(1) : digits.startsWith("00") ? digits.slice(2) : digits; }

// Mobile number typed by a person -> "+447306361031" (UK numbers may start with 0), or null if it can't be a phone number.
export function normalizePhone(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const raw = input.trim();
  if (!/^[+0-9\s().-]{7,25}$/.test(raw)) return null;
  let digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) { /* already international */ }
  else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = "44" + digits.slice(1);
  if (digits.length < 8 || digits.length > 15) return null;
  return "+" + digits;
}
