// Decimal half-up rounding; retain four decimals for quantity/unit price.
// Round each line's net to pennies before VAT. Discount is a line amount.
export function decimalUnits(value: number | string, places: number) {
  const text = String(value).trim();
  if (!/^[+-]?\d*(?:\.\d*)?$/.test(text) || !Number.isFinite(Number(text))) return 0;
  const negative = text.startsWith("-");
  const [whole = "0", fraction = ""] = text.replace(/^[+-]/, "").split(".");
  const magnitude = BigInt(whole || "0") * BigInt(10 ** places) + BigInt((fraction + "0".repeat(places)).slice(0, places) || "0");
  const rounded = magnitude + (Number(fraction[places] || 0) >= 5 ? BigInt(1) : BigInt(0));
  const result = Number(negative ? -rounded : rounded);
  return Number.isSafeInteger(result) ? result : 0;
}

export function toMinorUnits(value: number | string) {
  return decimalUnits(value, 2);
}

export function fromMinorUnits(value: number) {
  return value / 100;
}

export function toQuantityUnits(value: number | string) {
  return decimalUnits(value, 4);
}

export function toRateUnits(value: number | string) {
  return decimalUnits(value, 2);
}

export function multiplyUnitPrice(quantity: number, unitPrice: number, discount = 0) {
  const product = BigInt(Math.max(0, toQuantityUnits(quantity))) * BigInt(Math.max(0, decimalUnits(unitPrice, 4)));
  return Math.max(0, divideHalfUp(product, BigInt(1000000)) - toMinorUnits(discount));
}

export function calculateVatMinor(netMinor: number, vatRate: number) {
  return divideHalfUp(BigInt(Math.max(0, netMinor)) * BigInt(Math.max(0, toRateUnits(vatRate))), BigInt(10000));
}

function divideHalfUp(numerator: bigint, denominator: bigint) {
  return Number((numerator + denominator / BigInt(2)) / denominator);
}
