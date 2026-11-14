import { ApiError, apiV1, jsonBody, mutationHeaders, uuid } from "@/lib/server/api-v1";
import { contactCommand, companyCommand, invoiceCommand, scopedFilters } from "@/lib/server/business-contracts";
import { authorizeRequest, type SecurityDependencies } from "@/lib/server/stage1/security";
import { boundedUpload, type documentService } from "@/lib/server/stage1/documents";
import type { createRepositories } from "@/lib/server/stage1/repositories";

export type Stage1Dependencies = { security: SecurityDependencies; repositories: ReturnType<typeof createRepositories>; documents: ReturnType<typeof documentService> };
export function createStage1Api(deps: Stage1Dependencies | undefined) {
  return async (request: Request, segments: string[]) => {
    // This check precedes parsing any private body or creating any resource.
    if (!deps) return apiV1(async () => { throw new ApiError(503, "UNAVAILABLE", "Stage 1 integrations are awaiting review and approval."); });
    let download: Awaited<ReturnType<Stage1Dependencies["documents"]["download"]>> | undefined;
    const response = await apiV1(async () => {
      const [companies, company, resource, rawId, action] = segments;
      if (companies !== "companies" || !company || !resource || segments.length > 5) throw new ApiError(404, "INVALID_REQUEST", "Endpoint unavailable.");
      const companyId = uuid(company), id = rawId ? uuid(rawId) : null, method = request.method;
      const read = method === "GET";
      const capability = resource === "customers" || resource === "suppliers" ? read ? "contacts:read" : "contacts:write" : resource === "invoices" ? read ? "invoices:read" : "invoices:write" : resource === "documents" ? read ? "documents:read" : "documents:write" : resource === "settings" ? read ? "company:read" : "company:manage" : resource === "activity" && read ? "audit:read" : null;
      if (!capability) throw new ApiError(404, "INVALID_REQUEST", "Endpoint unavailable.");
      const access = await authorizeRequest(request, companyId, capability, deps.security);
      const search = new URL(request.url).searchParams;
      if (["customers", "suppliers", "documents", "activity"].includes(resource)) {
        for (const key of search.keys()) if (!["query", "limit", "cursor"].includes(key) || resource === "documents" && key === "query") throw new ApiError(400, "INVALID_REQUEST", "Unsupported filter.");
      }
      const filters = scopedFilters(search);
      if (resource === "customers" || resource === "suppliers") {
        if (read && !action) return id ? deps.repositories.getContact(access, resource, id) : deps.repositories.listContacts(access, resource, filters);
        if ((method === "POST" && !id || method === "PUT" && id) && !action) return deps.repositories.saveContact(access, resource, id, contactCommand(await jsonBody(request)), mutationHeaders(request.headers));
      }
      if (resource === "invoices" && !action) {
        if (read) return id ? deps.repositories.getInvoice(access, id) : deps.repositories.listInvoices(access, filters);
        if (method === "POST" && !id || method === "PUT" && id) {
          const command = invoiceCommand(await jsonBody(request, 524288));
          if (id && id !== command.id) throw new ApiError(400, "INVALID_REQUEST", "Invoice ID mismatch.");
          return deps.repositories.saveInvoice(access, command, mutationHeaders(request.headers));
        }
      }
      if (resource === "settings" && !id) {
        if (read) return deps.repositories.company(access);
        if (method === "PUT") return deps.repositories.saveCompany(access, companyCommand(await jsonBody(request)), mutationHeaders(request.headers));
      }
      if (resource === "activity" && read && !id) return deps.repositories.activity(access, filters);
      if (resource === "documents") {
        if (read && !id) return deps.documents.list(access, filters.limit, filters.cursor);
        if (method === "POST" && !id) {
          const key = request.headers.get("idempotency-key") ?? "";
          if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new ApiError(400, "INVALID_REQUEST", "Idempotency-Key required.");
          return deps.documents.intake(access, await boundedUpload(request), key);
        }
        if (id && read && action === "status") return deps.documents.status(access, id);
        if (id && read && action === "original") { download = await deps.documents.download(access, id); return { available: true }; }
        if (id && method === "POST" && action === "retry") return deps.documents.retry(access, id, mutationHeaders(request.headers));
      }
      throw new ApiError(405, "INVALID_REQUEST", "Operation unavailable.");
    });
    if (download && response.ok) return new Response(Buffer.from(download.bytes), { headers: { "content-type": download.mimeType, "content-disposition": "attachment; filename=invoice-original", "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-security-policy": "sandbox; default-src 'none'", "x-request-id": response.headers.get("x-request-id")! } });
    return response;
  };
}
