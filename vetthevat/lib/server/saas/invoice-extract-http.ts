import { ApiError, apiV1 } from "@/lib/server/api-v1";
import { AiExtractionError, aiExtractionConfigured, extractStatementWithGemini, extractWithGemini, type AiPage } from "@/lib/ai-extraction";
import { MAX_AI_PAGES, MAX_AI_REQUEST_BYTES } from "@/lib/invoice-checks";
import { validateDocumentSignature } from "@/lib/document-validation";
import { enforceRequestLimits } from "@/lib/server/request-limits";
import { requireBusinessScope, type BusinessServices } from "@/lib/server/saas/request-context";
import { secretKey } from "@/lib/server/web-auth/crypto";

type Env = Readonly<Record<string, string | undefined>>;
type Access = { companyId: string; actorId: string };
type Dependencies = { env?: Env; extract?: typeof extractWithGemini; extractStatement?: typeof extractStatementWithGemini; log?: (entry: Record<string, unknown>) => void; authorize?: (request: Request, services: BusinessServices) => Promise<Access> };

// Session, CSRF and company permission; the scoped transaction confirms live membership.
async function authorizeRequest(request: Request, services: BusinessServices): Promise<Access> {
  const scope = await requireBusinessScope(request, request.headers.get("x-company-id"), "invoices:write", services);
  return { companyId: scope.companyId, actorId: await services.database.scoped(scope, async (tx) => tx.actorId) };
}

const HOUR = 3600000, DAY = 86400000;
const PAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
// Requests allowed through the AI reader.
export const INVOICE_EXTRACT_LIMITS = { userPerHour: 120, companyPerDay: 1000, sitePerDay: 5000 } as const;

// kind "statement": a bank statement for bank VAT matching; otherwise an invoice or receipt.
async function readPages(request: Request): Promise<{ pages: AiPage[]; kind: "invoice" | "statement" }> {
  const invalid = (message: string) => new ApiError(400, "INVALID_REQUEST", message);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_AI_REQUEST_BYTES) throw invalid("These pages are too large to send together.");
  let form: FormData;
  try { form = await request.formData(); } catch { throw invalid("Send the invoice pages as form data."); }
  const files = form.getAll("page");
  if (!files.length || files.length > MAX_AI_PAGES) throw invalid(`Send between 1 and ${MAX_AI_PAGES} pages.`);
  const pages: AiPage[] = [];
  let total = 0;
  for (const file of files) {
    if (!(file instanceof File) || !PAGE_TYPES.includes(file.type)) throw invalid("Each page must be a JPG, PNG, WEBP or PDF file.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    total += bytes.length;
    try { validateDocumentSignature(file.type, bytes.length, bytes.subarray(0, 1024)); }
    catch (error) { throw invalid(error instanceof Error ? error.message : "This page could not be read."); }
    pages.push({ mimeType: file.type, bytes });
  }
  if (total > MAX_AI_REQUEST_BYTES) throw invalid("These pages are too large to send together.");
  return { pages, kind: form.get("kind") === "statement" ? "statement" : "invoice" };
}

// Never logs images, invoice contents or provider messages (they can quote the document).
export function invoiceExtractHandler(services: BusinessServices | undefined, dependencies: Dependencies = {}) {
  const env = dependencies.env ?? process.env, extract = dependencies.extract ?? extractWithGemini, extractStatement = dependencies.extractStatement ?? extractStatementWithGemini, authorize = dependencies.authorize ?? authorizeRequest;
  const log = dependencies.log ?? ((entry: Record<string, unknown>) => console.info(JSON.stringify(entry)));
  return (request: Request) => apiV1(async () => {
    if (!services) throw new ApiError(503, "UNAVAILABLE", "Invoice services are unavailable.");
    if (request.method !== "GET" && request.method !== "POST") throw new ApiError(405, "INVALID_REQUEST", "Method unavailable.");
    const { companyId, actorId } = await authorize(request, services);
    const available = aiExtractionConfigured(env);
    if (request.method === "GET") return { available };
    if (!available) throw new ApiError(503, "UNAVAILABLE", "The AI reader is not configured.");
    const { pages, kind } = await readPages(request), limits = INVOICE_EXTRACT_LIMITS, secret = services.auth.config.csrfSecret;
    await enforceRequestLimits(services.auth.store, [
      { key: secretKey(secret, `invoice-extract:user:${actorId}`), limit: limits.userPerHour, windowMs: HOUR },
      { key: secretKey(secret, `invoice-extract:company:${companyId}`), limit: limits.companyPerDay, windowMs: DAY },
      { key: secretKey(secret, "invoice-extract:site"), limit: limits.sitePerDay, windowMs: DAY }
    ]);
    const started = Date.now();
    try {
      if (kind === "statement") {
        const { statement, usage } = await extractStatement(pages, { env });
        log({ event: "statement_extract", status: "ok", latencyMs: Date.now() - started, pages: pages.length, rows: statement.rows.length, ...usage });
        return { source: "gemini", statement, usage };
      }
      const { invoice, usage } = await extract(pages, { env });
      log({ event: "invoice_extract", status: "ok", latencyMs: Date.now() - started, pages: pages.length, ...usage });
      return { source: "gemini", invoice, usage };
    } catch (error) {
      const code = error instanceof AiExtractionError ? error.code : "PROVIDER_ERROR";
      log({ event: kind === "statement" ? "statement_extract" : "invoice_extract", status: "failed", code, providerStatus: error instanceof AiExtractionError ? error.providerStatus : null, latencyMs: Date.now() - started, pages: pages.length });
      if (code === "RATE_LIMITED") throw new ApiError(429, "RATE_LIMITED", "The AI reader is busy. Try again shortly.", 60);
      throw new ApiError(503, "UNAVAILABLE", "The AI reader could not read this document.");
    }
  });
}
