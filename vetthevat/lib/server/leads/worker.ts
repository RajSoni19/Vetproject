import { timingSafeEqual, randomUUID } from "node:crypto";
import { LeadError, leadResponse } from "@/lib/server/leads/core";
// Machine-only outbox trigger. It exposes no lead records and requires a secret
// independent of the browser confirmation/hash secrets. No scheduler is installed.
export function leadWorkerHandler(secret: string | undefined, process: () => Promise<unknown>) {
  return async (request: Request) => {
    try {
      if (request.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST", "cache-control": "no-store" } });
      if (!secret || secret.length < 32) throw new LeadError(503, "UNAVAILABLE", "Notification worker is disabled.");
      const header = request.headers.get("authorization") ?? "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : "";
      if (Buffer.byteLength(token) !== Buffer.byteLength(secret) || !timingSafeEqual(Buffer.from(token), Buffer.from(secret))) throw new LeadError(401, "UNAUTHENTICATED", "Service authorization required.");
      const result = await process();
      return Response.json(result, { headers: { "cache-control": "no-store" } });
    } catch (error) { return leadResponse(error, randomUUID()); }
  };
}
