import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { LeadValidationError, leadPrivacyVersion, validateLead, type LeadInput, type LeadService, type LeadStatus } from "@/lib/leads/contracts";

export class LeadError extends Error {
  readonly status: number; readonly code: string; readonly retryAfter?: number;
  constructor(status: number, code: string, message: string, retryAfter?: number) { super(message); this.status = status; this.code = code; this.retryAfter = retryAfter; }
}
export type StoredLead = LeadInput & { id: string; createdAt: string; status: LeadStatus; notes: string; version: number };
export type RateBucket = { key: string; limit: number; seconds: number };
export interface LeadStore {
  consume(buckets: RateBucket[]): Promise<{ allowed: boolean; retryAfter: number }>;
  // Durable lead, idempotency key, duplicate identity and outbox commit together.
  save(input: { lead: LeadInput; keyHash: string; digest: string; duplicateHash: string; privacyVersion: string }): Promise<{ id: string; createdAt: string }>;
  list(filters: { query: string; service: LeadService | null; status: LeadStatus | null; cursor: string | null; limit: number }): Promise<{ items: StoredLead[]; nextCursor: string | null }>;
  update(input: { id: string; status: LeadStatus; notes: string; version: number; actor: string }): Promise<StoredLead>;
}
export type PublicLeadDependencies = {
  origin: string; secret: string; receiptSecret: string; store: LeadStore;
  verifyBot(token: string, requestId: string): Promise<boolean>;
  networkKey(request: Request): string;
};
export const leadReferencePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function opaque(secret: string, purpose: string, value: string) { return createHmac("sha256", secret).update(`${purpose}:${value}`).digest("hex"); }
export function receipt(reference: string, secret: string, now = Date.now()) {
  if (!leadReferencePattern.test(reference) || secret.length < 32) throw new LeadError(503, "UNAVAILABLE", "Confirmation is unavailable.");
  const payload = `${reference}.${Math.floor(now / 1000)}`;
  return `${payload}.${opaque(secret, "receipt", payload)}`;
}
export function verifyReceipt(value: string, secret: string | undefined, now = Date.now()): string | null {
  if (!secret || secret.length < 32 || value.length > 160) return null;
  const [reference, issued, signature, extra] = value.split(".");
  if (extra || !leadReferencePattern.test(reference ?? "") || !/^\d{10}$/.test(issued ?? "") || !/^[a-f0-9]{64}$/.test(signature ?? "")) return null;
  const age = Math.floor(now / 1000) - Number(issued);
  if (age < 0 || age > 600 || !timingSafeEqual(Buffer.from(signature), Buffer.from(opaque(secret, "receipt", `${reference}.${issued}`)))) return null;
  return reference;
}
export async function boundedJson(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json" || !request.body) throw new LeadError(400, "INVALID_REQUEST", "JSON form data is required.");
  const reader = request.body.getReader(), parts: Uint8Array[] = []; let size = 0;
  try { for (;;) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 16384) { await reader.cancel(); throw new LeadError(413, "INVALID_REQUEST", "Form data is too large."); } parts.push(chunk.value); } return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts))) as unknown; }
  catch (error) { if (error instanceof LeadError) throw error; throw new LeadError(400, "INVALID_REQUEST", "The form could not be read."); }
  finally { reader.releaseLock(); }
}
export function leadResponse(error: unknown, requestId: string): Response {
  const validation = error instanceof LeadValidationError, known = error instanceof LeadError;
  return Response.json({ error: { code: validation ? "VALIDATION" : known ? error.code : "UNAVAILABLE", message: validation ? error.message : known ? error.message : "Your enquiry could not be confirmed. Please retry with the same form or try again later.", ...(validation ? { fields: error.fields } : {}) }, requestId }, { status: validation ? 400 : known ? error.status : 503, headers: { "cache-control": "no-store", "x-request-id": requestId, ...(known && error.retryAfter ? { "retry-after": String(error.retryAfter) } : {}) } });
}
export function createPublicLeadHandler(deps: PublicLeadDependencies | undefined) {
  return async (request: Request) => {
    const requestId = randomUUID();
    try {
      if (request.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST", "cache-control": "no-store" } });
      if (!deps || deps.secret.length < 32 || deps.receiptSecret.length < 32) throw new LeadError(503, "UNAVAILABLE", "Enquiries are temporarily unavailable. Please try again later.");
      if (request.headers.get("origin") !== deps.origin || new URL(request.url).origin !== deps.origin || request.headers.get("sec-fetch-site") === "cross-site") throw new LeadError(403, "FORBIDDEN", "Please submit the form from this website.");
      const network = opaque(deps.secret, "network", deps.networkKey(request));
      const rate = await deps.store.consume([{ key: "global", limit: 300, seconds: 60 }, { key: `network:${network}`, limit: 20, seconds: 3600 }]);
      if (!rate.allowed) throw new LeadError(429, "RATE_LIMITED", "Too many enquiries. Please try again later.", rate.retryAfter);
      const body = await boundedJson(request);
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new LeadError(400, "INVALID_REQUEST", "Invalid form.");
      const row = body as Record<string, unknown>, { turnstileToken, website, ...fields } = row;
      if (website !== "" || typeof turnstileToken !== "string" || !turnstileToken || turnstileToken.length > 2048) throw new LeadError(400, "BOT_CHECK_FAILED", "Complete the security check and try again.");
      const lead = validateLead(fields);
      const key = request.headers.get("idempotency-key") ?? "";
      if (!leadReferencePattern.test(key)) throw new LeadError(400, "INVALID_REQUEST", "Refresh the form and try again.");
      // Verification nonce belongs to this challenge check, not the stable lead
      // retry key: a fresh challenge must never reuse a cached old verification.
      if (!await deps.verifyBot(turnstileToken, requestId)) throw new LeadError(400, "BOT_CHECK_FAILED", "The security check expired or failed. Please try again.");
      const identityRate = await deps.store.consume([{ key: `email:${opaque(deps.secret, "email", lead.email)}`, limit: 5, seconds: 3600 }]);
      if (!identityRate.allowed) throw new LeadError(429, "RATE_LIMITED", "Too many enquiries. Please try again later.", identityRate.retryAfter);
      const digest = opaque(deps.secret, "payload", JSON.stringify(lead));
      const duplicateHash = opaque(deps.secret, "duplicate", JSON.stringify({ ...lead, phone: lead.phone.replace(/\D/g, ""), fullName: lead.fullName.toLowerCase(), businessName: lead.businessName.toLowerCase() }));
      const saved = await deps.store.save({ lead, keyHash: opaque(deps.secret, "idempotency", key), digest, duplicateHash, privacyVersion: leadPrivacyVersion });
      if (!leadReferencePattern.test(saved.id) || !Number.isFinite(Date.parse(saved.createdAt))) throw new LeadError(503, "UNAVAILABLE", "Enquiry confirmation is unavailable. Please retry.");
      // Receipt is minted only AFTER the durable transaction acknowledges COMMIT.
      // No contact data or provider state is returned to this public endpoint.
      return Response.json({ received: true, reference: saved.id, redirect: "/get-started/thank-you" }, { status: 200, headers: { "cache-control": "no-store", "x-request-id": requestId, "set-cookie": `__Host-vtv-lead-receipt=${receipt(saved.id, deps.receiptSecret)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600` } });
    } catch (error) { return leadResponse(error, requestId); }
  };
}
