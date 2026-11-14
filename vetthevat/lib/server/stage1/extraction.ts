import { randomUUID } from "node:crypto";
import { ApiError, uuid } from "@/lib/server/api-v1";
import { parseInvoiceDate } from "@/lib/invoice-rules";
import type { InvoiceMime } from "@/lib/server/stage1/documents";
import type { Access } from "@/lib/server/stage1/security";
import { audit, type createRepositories } from "@/lib/server/stage1/repositories";

export type ExtractedLine = { description: string; quantity: string | null; unitPrice: string | null; net: string | null; vatRate: string | null; taxClassification: "Taxable" | "Zero-rated" | "Exempt" | "Out of scope" | null };
export type Extraction = {
  supplierName: string | null; supplierId: string | null; supplierVatNumber: string | null;
  invoiceNumber: string | null; invoiceDate: string | null; dueDate: string | null;
  net: string | null; vat: string | null; vatEvidence: "detected" | "not-evidenced"; gross: string | null; currency: string | null;
  vatRates: string[]; lines: ExtractedLine[]; confidence: "Medium" | "Needs review";
  warnings: string[]; reviewRequired: true;
};
type PositionedWord = { text: string; left: number; top: number; width: number; height: number };
const minor = (value: string) => BigInt(value.replace(".", ""));
function amount(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = value.trim().replace(/^(?:GBP|EUR|USD|£|€|\$)\s*/, "");
  // Ambiguous decimal/grouping formats are retained as warnings, never guessed.
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.replace(/,/g, "").split(".");
  if (whole.length > 12) return null;
  return `${BigInt(whole)}.${fraction.padEnd(2, "0")}`;
}
function separatedTable(rows: string[]): { lines: ExtractedLine[]; descriptionsMismatch: boolean } {
  const header = rows.findIndex(row => /^\s*(?:qty|quantity)\b.*\b(?:rate|unit price)\b.*\b(?:amount|total)\b/i.test(row));
  if (header < 0) return { lines: [], descriptionsMismatch: false };
  const numericRows: ExtractedLine[] = [];
  for (const row of rows.slice(header + 1)) {
    if (/^\s*(?:sub\s*total|total|balance due)\b/i.test(row)) break;
    const match = row.match(/^\s*(\d{1,6}(?:\.\d{1,4})?)\s+((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,4})?)\s+((?:[£€$]\s*)?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,4})?)\s*$/);
    if (!match) continue;
    numericRows.push({ description: "", quantity: match[1], unitPrice: amount(match[2]), net: amount(match[3]), vatRate: null, taxClassification: null });
  }
  if (!numericRows.length) return { lines: [], descriptionsMismatch: false };

  const itemHeader = rows.findIndex(row => /^\s*#?\s*item(?:\s|$)/i.test(row));
  if (itemHeader < 0) return { lines: numericRows, descriptionsMismatch: false };
  const detailRows: { description: string; number: number | null }[] = [];
  for (const row of rows.slice(itemHeader + 1, header)) {
    const value = row.trim();
    if (!value) continue;
    if (/\b(?:bank account|business account|account number|sort code|payment instructions|thanks for your business)\b/i.test(value)) break;
    const numbered = value.match(/^(\d{1,3})\s*(?:\||[.)]\s+|\s{2,})(.+)$/);
    const description = (numbered?.[2] ?? value).trim();
    if (!description || /^(?:item|description|qty|quantity|rate|amount|total)\b/i.test(description) || /^[a-z]\)$/i.test(description) || !/[a-z]{3}/i.test(description)) continue;
    detailRows.push({ description, number: numbered ? Number(numbered[1]) : null });
  }
  if (detailRows.length === numericRows.length) {
    return { lines: numericRows.map((line, index) => ({ ...line, description: detailRows[index].description })), descriptionsMismatch: false };
  }

  const numbered = new Map<number, string>();
  const ambiguousNumbers = new Set<number>();
  for (const detail of detailRows) {
    if (detail.number === null || detail.number < 1 || detail.number > numericRows.length) continue;
    if (numbered.has(detail.number)) ambiguousNumbers.add(detail.number);
    else numbered.set(detail.number, detail.description);
  }
  return {
    lines: numericRows.map((line, index) => ({ ...line, description: ambiguousNumbers.has(index + 1) ? "" : numbered.get(index + 1) ?? "" })),
    descriptionsMismatch: detailRows.length > 0,
  };
}
function positionedTable(value: unknown): { lines: ExtractedLine[]; descriptionsMismatch: boolean } | null {
  if (!value || typeof value !== "object" || !("words" in value) || !Array.isArray(value.words) || value.words.length > 2500) return null;
  const words: PositionedWord[] = value.words.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const word = item as Record<string, unknown>;
    const { text, left, top, width, height } = word;
    if (typeof text !== "string" || !text || text.length > 200 || /[\u0000-\u001f]/.test(text)
      || ![left, top, width, height].every(Number.isFinite)
      || Number(left) < 0 || Number(top) < 0 || Number(left) > 10000 || Number(top) > 10000
      || Number(width) < 1 || Number(height) < 1 || Number(width) > 10000 || Number(height) > 10000) return [];
    return [{ text, left: Number(left), top: Number(top), width: Number(width), height: Number(height) }];
  });
  if (!words.length) return null;
  const centerY = (word: PositionedWord) => word.top + word.height / 2;
  const centerX = (word: PositionedWord) => word.left + word.width / 2;
  const quantityHeaders = words.filter(word => /^(?:qty|quantity)$/i.test(word.text));
  const rateHeaders = words.filter(word => /^rate$/i.test(word.text));
  const amountHeaders = words.filter(word => /^amount$/i.test(word.text));
  let header: { quantity: PositionedWord; rate: PositionedWord; amount: PositionedWord } | undefined;
  for (const quantity of quantityHeaders) {
    const rate = rateHeaders.find(word => Math.abs(centerY(word) - centerY(quantity)) <= Math.max(8, quantity.height));
    const amount = amountHeaders.find(word => rate && Math.abs(centerY(word) - centerY(quantity)) <= Math.max(8, quantity.height));
    if (rate && amount && centerX(quantity) < centerX(rate) && centerX(rate) < centerX(amount)) {
      header = { quantity, rate, amount };
      break;
    }
  }
  if (!header) return null;
  const tableTop = centerY(header.quantity) + Math.max(2, header.quantity.height / 2);
  const footerTop = Math.min(...words.filter(word => centerY(word) > tableTop && /^(?:subtotal|sub|total|balance)$/i.test(word.text)).map(centerY), Infinity);
  const tableWords = words.filter(word => centerY(word) > tableTop && centerY(word) < footerTop);
  const medianHeight = [...tableWords].map(word => word.height).sort((a, b) => a - b)[Math.floor(tableWords.length / 2)] ?? 1;
  const tolerance = Math.max(4, medianHeight * 0.75);
  const groups: { y: number; words: PositionedWord[] }[] = [];
  for (const word of [...tableWords].sort((a, b) => centerY(a) - centerY(b) || a.left - b.left)) {
    const last = groups.at(-1);
    if (last && Math.abs(centerY(word) - last.y) <= tolerance) {
      last.words.push(word);
      last.y = last.words.reduce((sum, item) => sum + centerY(item), 0) / last.words.length;
    } else groups.push({ y: centerY(word), words: [word] });
  }
  const qtyX = centerX(header.quantity), rateX = centerX(header.rate), amountX = centerX(header.amount);
  const quantityRateBoundary = (qtyX + rateX) / 2, rateAmountBoundary = (rateX + amountX) / 2;
  const numeric = (word: PositionedWord) => /^[£€$]?\d[\d,]*(?:\.\d{1,4})?$/.test(word.text);
  const rows = groups.flatMap(group => {
    const cells = group.words.filter(numeric).sort((a, b) => centerX(a) - centerX(b));
    const quantity = cells.filter(word => centerX(word) < quantityRateBoundary).at(-1);
    const rate = cells.filter(word => centerX(word) >= quantityRateBoundary && centerX(word) < rateAmountBoundary).at(-1);
    const total = cells.filter(word => centerX(word) >= rateAmountBoundary).at(-1);
    if (!quantity || !rate || !total || !/^\d+(?:\.\d{1,4})?$/.test(quantity.text)) return [];
    return [{ y: group.y, quantity: quantity.text, rate: amount(rate.text), total: amount(total.text), quantityWord: quantity, rateWord: rate, totalWord: total, words: group.words }];
  });
  if (!rows.length) return null;
  const lines = rows.map((row, index) => {
    const descriptionWords = row.words.filter(word => centerX(word) < quantityRateBoundary && word !== row.quantityWord && word !== row.rateWord && word !== row.totalWord).sort((a, b) => a.left - b.left);
    if (/^\d{1,3}$/.test(descriptionWords[0]?.text ?? "") && Number(descriptionWords[0].text) === index + 1) descriptionWords.shift();
    return { description: descriptionWords.map(word => word.text).join(" ").trim(), quantity: row.quantity, unitPrice: row.rate, net: row.total, vatRate: null, taxClassification: null } satisfies ExtractedLine;
  });
  return { lines, descriptionsMismatch: lines.some(line => !line.description) };
}
export function parseExtraction(text: string, suppliers: readonly { id: string; name: string; vatNumber: string }[] = [], layout?: unknown): Extraction {
  if (text.length > 1000000) throw new ApiError(400, "INVALID_REQUEST", "Extraction output too large.");
  const rows = text.replace(/\r/g, "").split("\n");
  const values = (labels: string) => {
    const inline = new RegExp(`^(?:${labels})\\s*[:#]?\\s+(.+)$`, "i");
    const labelOnly = new RegExp(`^(?:${labels})\\s*[:#]?\\s*$`, "i");
    const otherLabel = /^(?:supplier(?:\s+name)?|from|name|invoice\s*(?:number|no\.?|#)|invoice\s+date|due\s+date|date|currency|sub\s*total|net\s+(?:amount|total)|total\s+payable|amount\s+due|grand\s+total|gross\s+total|invoice\s+total|total|vat(?:\s+amount)?|total\s+vat|tax\s+amount|balance\s+due)\s*[:#]?$/i;
    return rows.flatMap(row => {
      const cells = row.split(/\s{2,}/).map(cell => cell.trim()).filter(Boolean);
      return cells.flatMap((cell, index) => {
        const match = cell.match(inline);
        if (match) return [match[1].trim()];
        const next = cells[index + 1];
        return labelOnly.test(cell) && next && !otherLabel.test(next) ? [next] : [];
      });
    });
  };
  const unique = (items: (string | null)[]) => { const choices = [...new Set(items.filter((item): item is string => item !== null && item !== ""))]; return choices.length === 1 ? choices[0] : null; };
  const get = (labels: string) => unique(values(labels));
  const money = (labels: string) => unique(values(labels).map(amount));
  const net = money("net amount|net total|sub\\s*total|sub-total"), vat = money("vat amount|total vat|vat|tax amount"), gross = money("total payable|amount due|grand total|gross total|invoice total|total");
  const supplierName = get("supplier|supplier name|from|name"), supplierVatNumber = get("supplier vat(?: number)?|vat (?:number|no\\.?)");
  const candidates = suppliers.filter(row => supplierVatNumber ? row.vatNumber.replace(/\s/g, "").toUpperCase() === supplierVatNumber.replace(/\s/g, "").toUpperCase() : supplierName && row.name.trim().toLowerCase() === supplierName.toLowerCase());
  const lines: ExtractedLine[] = [];
  // Conservative explicit table format: description | qty | price | rate or
  // classification | net. Other layouts remain unresolved for human review.
  for (const row of rows) {
    const tableRow=row.match(/^\s*\d{1,2}\s+(.+?)\s+(\d+(?:\.\d{1,2})?)\s+(\d+(?:\.\d{1,2})?)\s+(\d+(?:\.\d{1,2})?)\s*$/);
    if(tableRow){
      lines.push({description:tableRow[1].trim(),quantity:tableRow[2],unitPrice:amount(tableRow[3]),net:amount(tableRow[4]),vatRate:null,taxClassification:null});
      continue;
    }
    const cells = row.split("|").map(cell => cell.trim());
    if (cells.length !== 5 || !cells[0] || !/^\d+(?:\.\d{1,4})?$/.test(cells[1])) continue;
    const classifications: Record<string, ExtractedLine["taxClassification"]> = { "zero-rated": "Zero-rated", exempt: "Exempt", "out of scope": "Out of scope" };
    const classification = classifications[cells[3].toLowerCase()] ?? null;
    const explicitRate = cells[3].match(/^(\d{1,2}(?:\.\d{1,2})?|100(?:\.0{1,2})?)%$/)?.[1] ?? null;
    lines.push({ description: cells[0], quantity: cells[1], unitPrice: amount(cells[2]), vatRate: classification ? "0" : explicitRate, taxClassification: classification ?? (explicitRate === null ? null : Number(explicitRate) === 0 ? "Zero-rated" : "Taxable"), net: amount(cells[4]) });
  }
  let descriptionsMismatch = false;
  const positioned = positionedTable(layout);
  if (positioned?.lines.length) {
    lines.splice(0, lines.length, ...positioned.lines);
    descriptionsMismatch = positioned.descriptionsMismatch;
  }
  if (!lines.length) {
    const separated = separatedTable(rows);
    lines.push(...separated.lines);
    descriptionsMismatch = separated.descriptionsMismatch;
  }
  const invoiceNumber = get("invoice\\s*(?:number|no\\.?|#)"), invoiceDate = unique(values("invoice date|date").map(parseInvoiceDate)), dueDate = unique(values("due date").map(parseInvoiceDate));
  const currencySymbols=text.includes("£")?["GBP"]:text.includes("€")?["EUR"]:[];
  const currencies = [...new Set([...values("currency").map(value => value.toUpperCase()), ...text.match(/\b(?:GBP|EUR|USD)\b/g) ?? [],...currencySymbols])];
  const currency = currencies.length === 1 && ["GBP", "EUR", "USD"].includes(currencies[0]) ? currencies[0] : null;
  const warnings = ["Human review required before confirmation."];
  if (candidates.length > 1) warnings.push("Ambiguous supplier identity.");
  if (!supplierName) warnings.push("Supplier could not be identified.");
  else if (candidates.length === 0) warnings.push("Supplier match requires human review.");
  if (descriptionsMismatch) warnings.push("Extracted descriptions and numeric rows do not reconcile; review the original before saving.");
  if (!invoiceNumber || !invoiceDate || !supplierName || !currency || net === null || gross === null) warnings.push("Missing or ambiguous invoice fields; consult the original.");
  if(vat===null)warnings.push("VAT not evidenced — review required");
  if (net !== null && vat !== null && gross !== null && minor(net) + minor(vat) !== minor(gross)) warnings.push("Source totals do not reconcile.");
  if (!lines.length || lines.some(line => line.vatRate === null || line.net === null || line.unitPrice === null)) warnings.push("Line items or VAT treatment require review.");
  if (net !== null && lines.length && lines.every(line => line.net !== null) && lines.reduce((sum, line) => sum + minor(line.net!), BigInt(0)) !== minor(net)) warnings.push("Line amounts do not reconcile to the source net total.");
  if (invoiceDate && dueDate && dueDate < invoiceDate) warnings.push("Due date precedes invoice date.");
  const explicitRates=[...text.matchAll(/\b(?:VAT|tax)(?:\s+rate)?\s*[:=]?\s*(\d{1,2}(?:\.\d{1,2})?)\s*%/gi)].map(match=>match[1]);
  const vatRates=[...new Set([...lines.flatMap(line=>line.vatRate===null?[]:[line.vatRate]),...explicitRates])];
  return { supplierName, supplierId: candidates.length === 1 ? uuid(candidates[0].id) : null, supplierVatNumber, invoiceNumber, invoiceDate, dueDate, net, vat, vatEvidence:vat===null?"not-evidenced":"detected", gross, currency, lines, vatRates, confidence: warnings.length === 1 ? "Medium" : "Needs review", warnings, reviewRequired: true };
}
export interface ExtractionReaders {
  digitalPdf(bytes: Uint8Array, signal: AbortSignal): Promise<{ pages: number; textByPage: string[] }>;
  // Sandboxed, bounded page rendering and image decoding are adapter duties.
  scannedPdfPage(bytes: Uint8Array, page: number, signal: AbortSignal): Promise<string>;
  image(bytes: Uint8Array, mimeType: InvoiceMime, signal: AbortSignal): Promise<string>;
}
export async function extractOriginal(bytes: Uint8Array, mime: InvoiceMime, readers: ExtractionReaders, signal: AbortSignal) {
  signal.throwIfAborted();
  let text: string;
  if (mime === "application/pdf") {
    const pdf = await readers.digitalPdf(bytes, signal);
    if (!Number.isInteger(pdf.pages) || pdf.pages < 1 || pdf.pages > 20 || pdf.textByPage.length !== pdf.pages) throw new Error("Page limit.");
    const pages: string[] = [];
    for (let i = 0; i < pdf.pages; i++) {
      signal.throwIfAborted();
      pages.push(pdf.textByPage[i].replace(/\s/g, "").length >= 40 ? pdf.textByPage[i] : await readers.scannedPdfPage(bytes, i + 1, signal));
    }
    text = pages.join("\n");
  } else text = await readers.image(bytes, mime, signal);
  signal.throwIfAborted();
  if (!text.trim() || text.length > 1000000) throw new Error("Invalid extraction output.");
  return text;
}

export function extractionJobs(repositories: ReturnType<typeof createRepositories>) {
  return {
    claim(access: Access, documentId: string) { return repositories.scoped(access, "documents:write", async tx => {
      const lease = randomUUID();
      const job = (await tx.query("UPDATE vat.extraction_jobs SET status='processing',attempts=attempts+1,lease_token=$3,lease_until=now()+interval '2 minutes',version=version+1 WHERE company_id=$1 AND document_id=$2 AND attempts<3 AND (status='queued' OR (status='processing' AND lease_until<now())) RETURNING document_id,attempts,version::text", [access.companyId, uuid(documentId), lease])).rows[0];
      return job ? { ...job, lease } : null;
    }); },
    finish(access: Access, documentId: string, lease: string, result: Extraction | null) { return repositories.scoped(access, "documents:write", async tx => {
      const row = (await tx.query("UPDATE vat.extraction_jobs SET status=$4,result=$5::jsonb,failure_code=$6,lease_token=NULL,lease_until=NULL,version=version+1 WHERE company_id=$1 AND document_id=$2 AND lease_token=$3 AND status='processing' AND lease_until>now() RETURNING version::text", [access.companyId, uuid(documentId), uuid(lease), result ? "ready" : "failed", result ? JSON.stringify(result) : null, result ? null : "EXTRACTION_FAILED"])).rows[0];
      if (!row) throw new ApiError(409, "CONFLICT", "Extraction lease expired or was replaced.");
      await audit(tx, access, result ? "extraction.ready" : "extraction.failed", "document", documentId, String(row.version));
      return { status: result ? "ready" : "failed", version: row.version };
    }); }
  };
}
