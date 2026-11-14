import { randomUUID } from "node:crypto";
import { leadServices, leadStatuses, type LeadService, type LeadStatus } from "@/lib/leads/contracts";
import { boundedJson, LeadError, leadReferencePattern, leadResponse, type LeadStore } from "@/lib/server/leads/core";
export type LeadAdminAuthorization = (request: Request, mutation: boolean) => Promise<{ actor: string }>;
export function adminLeadHandler(authorize: LeadAdminAuthorization, services: () => { store: LeadStore; notify(): Promise<unknown> } | undefined) {
  return async (request: Request) => {
    const requestId = randomUUID();
    try {
      const { actor } = await authorize(request, request.method !== "GET");
      const deps = services(); if (!deps) throw new LeadError(503, "UNAVAILABLE", "Lead storage is not configured.");
      if (request.method === "GET") {
        const search = new URL(request.url).searchParams;
        for (const name of search.keys()) if (!["query", "service", "status", "cursor"].includes(name) || search.getAll(name).length !== 1) throw new LeadError(400, "INVALID_REQUEST", "Invalid lead filters.");
        const query = (search.get("query") ?? "").trim(), service = search.get("service"), status = search.get("status"), cursor = search.get("cursor");
        if (query.length > 200 || /[\x00-\x1f\x7f]/.test(query) || service && !leadServices.includes(service as LeadService) || status && !leadStatuses.includes(status as LeadStatus) || cursor && !leadReferencePattern.test(cursor)) throw new LeadError(400, "INVALID_REQUEST", "Invalid lead filters.");
        return Response.json(await deps.store.list({ query, service: service as LeadService | null, status: status as LeadStatus | null, cursor, limit: 25 }), { headers: { "cache-control": "private, no-store" } });
      }
      if (request.method === "PATCH") {
        const row = await boundedJson(request) as Record<string, unknown>;
        if (!row || typeof row !== "object" || Array.isArray(row) || Object.keys(row).some(key => !["id", "status", "notes", "version"].includes(key)) || typeof row.id !== "string" || !leadReferencePattern.test(row.id) || !leadStatuses.includes(row.status as LeadStatus) || typeof row.notes !== "string" || row.notes.length > 2000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(row.notes) || !Number.isSafeInteger(row.version) || Number(row.version) < 1) throw new LeadError(400, "INVALID_REQUEST", "Invalid lead update.");
        const lead = await deps.store.update({ id: row.id, status: row.status as LeadStatus, notes: row.notes.trim(), version: Number(row.version), actor });
        return Response.json({ lead }, { headers: { "cache-control": "private, no-store" } });
      }
      if (request.method === "POST") return Response.json(await deps.notify(), { headers: { "cache-control": "private, no-store" } });
      return new Response(null, { status: 405, headers: { allow: "GET, PATCH, POST", "cache-control": "no-store" } });
    } catch (error) { return leadResponse(error, requestId); }
  };
}
