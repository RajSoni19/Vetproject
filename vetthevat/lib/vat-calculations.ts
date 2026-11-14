import type { InvoiceLineItem, VATBreakdown } from "@/lib/domain";
import { calculateVatMinor, fromMinorUnits, multiplyUnitPrice, toMinorUnits } from "@/lib/money";

export function roundMoney(value: number) {
  return fromMinorUnits(toMinorUnits(value));
}

export function calculateLine(input: Pick<InvoiceLineItem, "description" | "quantity" | "unitPrice" | "discount" | "vatRate"> & Pick<Partial<InvoiceLineItem>, "id" | "taxClassification">): InvoiceLineItem {
  const { quantity, unitPrice, discount, vatRate } = input;
  const valid = [quantity, unitPrice, discount, vatRate].every((value) => Number.isFinite(value) && value >= 0);
  const netMinor = valid ? multiplyUnitPrice(quantity, unitPrice, discount) : 0;
  const vatMinor = calculateVatMinor(netMinor, vatRate);
  const netAmount = fromMinorUnits(netMinor);
  const vatAmount = fromMinorUnits(vatMinor);
  return {
    id: input.id ?? crypto.randomUUID(),
    description: input.description,
    quantity,
    unitPrice,
    discount,
    vatRate,
    ...(input.taxClassification === undefined ? {} : { taxClassification: input.taxClassification }),
    netAmount,
    vatAmount,
    grossAmount: fromMinorUnits(netMinor + vatMinor),
    confidence: valid ? "High" : "Needs review"
  };
}

export function calculateInvoiceTotals(lines: InvoiceLineItem[]) {
  const subtotalMinor = lines.reduce((sum, line) => sum + toMinorUnits(line.netAmount), 0);
  const vatMinor = lines.reduce((sum, line) => sum + toMinorUnits(line.vatAmount), 0);
  return { subtotal: fromMinorUnits(subtotalMinor), vatAmount: fromMinorUnits(vatMinor), totalAmount: fromMinorUnits(subtotalMinor + vatMinor) };
}

export function buildVATBreakdown(lines: InvoiceLineItem[]): VATBreakdown[] {
  const groups = new Map<number, VATBreakdown>();
  for (const line of lines) {
    const current = groups.get(line.vatRate) ?? { rate: line.vatRate, netAmount: 0, vatAmount: 0, grossAmount: 0 };
    current.netAmount = roundMoney(current.netAmount + line.netAmount);
    current.vatAmount = roundMoney(current.vatAmount + line.vatAmount);
    current.grossAmount = roundMoney(current.grossAmount + line.grossAmount);
    groups.set(line.vatRate, current);
  }
  return Array.from(groups.values()).sort((a, b) => a.rate - b.rate);
}

export function validateInvoiceTotals(extractedTotal: number, calculatedTotal: number) {
  const difference = roundMoney(Math.abs(extractedTotal - calculatedTotal));
  return {
    isValid: difference <= 0.02,
    difference
  };
}
