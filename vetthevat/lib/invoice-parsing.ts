export function parseDocumentMoney(value?: string): number | null {
  if (!value) return null;
  const negativeParentheses = /^\s*\(.*\)\s*$/.test(value);
  let amount = value.replace(/\b(?:GBP|EUR|USD)\b/gi, "").replace(/[£€$\s()]/g, "");
  if (!/^-?\d[\d.,]*$/.test(amount)) return null;
  const comma = amount.lastIndexOf(","), dot = amount.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) amount = comma > dot ? amount.replace(/\./g, "").replace(",", ".") : amount.replace(/,/g, "");
  else if (comma >= 0) amount = /^-?\d{1,3}(?:,\d{3})+$/.test(amount) ? amount.replace(/,/g, "") : amount.replace(",", ".");
  if (!/^-?\d+(?:\.\d+)?$/.test(amount)) return null;
  const parsed = Number(amount);
  return Number.isFinite(parsed) ? negativeParentheses ? -Math.abs(parsed) : parsed : null;
}

export function matchDocumentAmount(text: string, labels: string) {
  // Stay on the same text line; do not consume minus signs as label separators.
  const match = text.match(new RegExp(`\\b(?:${labels})\\b[ \\t]*[:#@]?[ \\t]*(?:\\d{1,2}(?:[.,]\\d+)?[ \\t]*%[ \\t]*)?(?:(?:GBP|EUR|USD)[ \\t]*)?[£€$]?[ \\t]*(\\(?-?\\d[\\d.,]*\\)?)(?![\\d.,]|[ \\t]*%)`, "i"));
  return parseDocumentMoney(match?.[1]);
}
