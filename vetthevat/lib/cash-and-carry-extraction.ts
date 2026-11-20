// Cash-and-carry invoices (Booker and similar till invoices printed from a
// wholesaler's system). Layout, one item per row:
//   CODE DESCRIPTION  PACK SIZE  QTY  PRICE [P]  VALUE  VAT-CODE  [RRP POR]
//   245105 Flying Goose Sriracha Mayo  6 455ml  2  15.99  31.98  A
// Prices and values exclude VAT. A VAT table gives each code's rate:
//   A: 0.00  73.93  0.00  73.93  0.00
//   B:20.00  12.98  0.00  12.98  2.60
// Voided items appear as a "VOID NOTE" followed by the same item with a minus
// quantity and value; both are removed. Nothing is invented: the reading is
// used only when the items add up to the goods total the invoice prints.
import type { ExtractedInvoiceLine } from "@/lib/invoice-text-extraction";

export type CashAndCarryReading = {
  lines: ExtractedInvoiceLine[];
  goods: number; vat: number | null; gross: number | null;
  notes: string[];
};

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const money = (value: string) => Number(value.replace(/,/g, ""));
const ITEM = /^\*?(\d{5,7})\s+(.+?)\s+(\d{1,3})\s+(\S+)\s+(\d{1,4})(-)?\s+(\d{1,5}\.\d{2})(?:\s+[A-Z])?\s+(\d{1,6}\.\d{2})(-)?\s*([A-Z])(?:\s+\d{1,5}\.\d{2}\s+\d{1,3}(?:\.\d+)?%)?\s*$/;
const VAT_ROW = /(?:^|\s)([A-Z])\s*:\s*(\d{1,2}\.\d{2})\s+(\d{1,6}\.\d{2})\s+(\d{1,6}\.\d{2})\s+(\d{1,6}\.\d{2})\s+(\d{1,6}\.\d{2})/;

type Item = { code: string; description: string; pack: string; quantity: number; price: number; value: number; vatCode: string; negative: boolean };

export function readCashAndCarry(text: string): CashAndCarryReading | null {
  const rows = text.replace(/\r/g, "").split("\n").map((row) => row.replace(/\t+/g, " ").replace(/\s+/g, " ").trim());
  const items: Item[] = [];
  const rates = new Map<string, { rate: number; goods: number; vat: number }>();
  let goods: number | null = null, vat: number | null = null, gross: number | null = null;
  for (const row of rows) {
    const item = row.match(ITEM);
    if (item) {
      const [, code, description, packCount, size, quantity, minusQuantity, price, value, minusValue, vatCode] = item;
      items.push({ code, description: description.trim(), pack: `${packCount} x ${size}`, quantity: Number(quantity), price: money(price), value: money(value), vatCode, negative: Boolean(minusQuantity || minusValue) });
      continue;
    }
    const vatRow = row.match(VAT_ROW);
    if (vatRow) rates.set(vatRow[1], { rate: money(vatRow[2]), goods: money(vatRow[3]), vat: money(vatRow[6]) });
    const goodsTotal = row.match(/TOTALS\s*:\s*GOODS\s+(\d{1,7}\.\d{2})/i); if (goodsTotal) goods = money(goodsTotal[1]);
    const vatTotal = row.match(/(?:^|\s)VAT\s+(\d{1,7}\.\d{2})\s*:/); if (vatTotal) vat = money(vatTotal[1]);
    const total = row.match(/(?:INVOICE|GRAND)\s+TOTAL\s+(\d{1,7}\.\d{2})/i); if (total && gross === null) gross = money(total[1]);
  }
  if (items.length < 1 || !rates.size) return null;

  // A voided item cancels the earlier identical item; both are dropped.
  const kept: Item[] = [], notes: string[] = [];
  for (const item of items) {
    if (!item.negative) { kept.push(item); continue; }
    const match = kept.findIndex((other) => other.code === item.code && Math.abs(other.value - item.value) < 0.005);
    if (match >= 0) { kept.splice(match, 1); notes.push(`Voided item removed: ${item.description}.`); }
    else kept.push({ ...item, value: -item.value, quantity: -item.quantity });
  }
  const itemsTotal = round2(kept.reduce((sum, item) => sum + item.value, 0));
  const tableGoods = round2([...rates.values()].reduce((sum, group) => sum + group.goods, 0));
  const printedGoods = goods ?? tableGoods;
  if (Math.abs(itemsTotal - printedGoods) > 0.011) return null;

  const tableVat = round2([...rates.values()].reduce((sum, group) => sum + group.vat, 0));
  const lines: ExtractedInvoiceLine[] = kept.map((item) => {
    const group = rates.get(item.vatCode);
    const rate = group ? group.rate : null;
    return {
      description: `${item.description} (${item.pack})`,
      quantity: item.quantity, unitPrice: item.price, netAmount: item.value, vatRate: rate,
      ...(rate === null ? {} : { taxClassification: rate === 0 ? "Zero-rated" as const : "Taxable" as const })
    };
  });
  if (lines.some((line) => line.vatRate === null)) notes.push("Some items have a VAT code that is not in the VAT table. Choose their VAT before saving.");
  return { lines, goods: printedGoods, vat: vat ?? tableVat, gross: gross ?? round2(printedGoods + (vat ?? tableVat)), notes };
}
