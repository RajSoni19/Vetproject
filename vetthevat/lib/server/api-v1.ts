// Pure contract validation. No business endpoint is enabled by these helpers.
import { randomUUID } from "node:crypto";
import { DatabaseError, decimalString } from "@/lib/server/database-core";
import { friendlyErrorMessage } from "@/lib/friendly-errors";
export class ApiError extends Error {
  readonly status: number;
  readonly code: "INVALID_REQUEST" | "UNAUTHENTICATED" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE" | "RATE_LIMITED";
  readonly retryAfterSeconds?: number;
  // Messages reach the people using the app, so technical wording is turned into plain words.
  constructor(status: number, code: ApiError["code"], message: string, retryAfterSeconds?:number) { super(friendlyErrorMessage(message)); this.name = "ApiError"; this.status=status; this.code=code; this.retryAfterSeconds=retryAfterSeconds; }
}
export function uuid(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new ApiError(400,"INVALID_REQUEST","A valid identifier is required.");
  return value;
}
export function objectBody(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) throw new ApiError(400,"INVALID_REQUEST","Invalid request fields.");
  return value as Record<string,unknown>;
}
export function pagination(search: URLSearchParams) {
  const limit = search.get("limit") ?? "25", cursor = search.get("cursor");
  if (!/^[1-9]\d?$|^100$/.test(limit) || cursor !== null && !/^[A-Za-z0-9_-]{1,256}$/.test(cursor)) throw new ApiError(400,"INVALID_REQUEST","Invalid pagination.");
  return { limit: Number(limit), cursor };
}
export function mutationHeaders(headers: Headers) {
  const key = headers.get("idempotency-key"), version = headers.get("if-match");
  if (!key || !/^[A-Za-z0-9_-]{16,128}$/.test(key) || !version || !/^"[1-9]\d{0,8}"$/.test(version)) throw new ApiError(400,"INVALID_REQUEST","Idempotency-Key and a quoted version If-Match are required.");
  return { key, version: Number(version.slice(1,-1)) };
}
export function draftLine(value: unknown) {
  const line = objectBody(value,["id","description","quantity","unitPrice","discount","vatRate","taxClassification"]);
  if(typeof line.description !== "string" || line.description.length > 2000) throw new ApiError(400,"INVALID_REQUEST","Invalid line description.");
  const classification = line.taxClassification;
  if (classification !== undefined && !["Taxable","Zero-rated","Exempt","Out of scope"].includes(String(classification))) throw new ApiError(400,"INVALID_REQUEST","Invalid tax classification.");
  try {
    return {id:uuid(line.id),description:line.description,quantity:decimalString(line.quantity,4),unitPrice:decimalString(line.unitPrice,4),discount:decimalString(line.discount,2),vatRate:decimalString(line.vatRate,2),...(classification === undefined ? {} : {taxClassification:classification})};
  } catch { throw new ApiError(400,"INVALID_REQUEST","Invalid line identifier or decimal strings."); }
}
export async function jsonBody(request: Request, maxBytes = 65536): Promise<unknown> {
  if (!request.headers.get("content-type")?.split(";")[0].trim().match(/^application\/json$/i) || !request.body) throw new ApiError(400,"INVALID_REQUEST","JSON body required.");
  const reader = request.body.getReader(); let size = 0; const chunks: Uint8Array[] = [];
  try {
    for (;;) { const {done,value} = await reader.read(); if(done)break; size += value.byteLength; if(size>maxBytes){ await reader.cancel(); throw new ApiError(413,"INVALID_REQUEST","Request body too large."); } chunks.push(value); }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch(error) { if(error instanceof ApiError)throw error; throw new ApiError(400,"INVALID_REQUEST","Invalid JSON body."); }
  finally { reader.releaseLock(); }
}
export function requireSameOrigin(request: Request, approvedOrigin: string) {
  const reqOrigin = request.headers.get("origin");
  if (process.env.NODE_ENV === "development") {
    if (!reqOrigin || reqOrigin.includes("localhost") || reqOrigin.includes("127.0.0.1") || reqOrigin === approvedOrigin) {
      return;
    }
  }
  // Behind a reverse proxy / tunnel the server URL is its local address; the
  // public address arrives in the forwarded headers. The browser-set Origin
  // header must still equal the approved origin exactly.
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host"))?.split(",")[0].trim();
  const forwarded = host ? `${proto ?? url.protocol.replace(/:$/, "")}://${host}` : null;
  // Optional extra exact origins (e.g. the local address next to a share link).
  const approved = [approvedOrigin, ...(process.env.WEB_AUTH_EXTRA_ORIGINS ?? "").split(",").map(value => value.trim()).filter(value => /^https?:\/\/[^/\s]+$/.test(value))];
  if (!reqOrigin || !approved.includes(reqOrigin) || (url.origin !== reqOrigin && forwarded !== reqOrigin)) throw new ApiError(403,"FORBIDDEN","Request origin denied.");
}
export async function apiV1(operation: () => Promise<unknown>): Promise<Response> {
  const requestId = randomUUID();
  const headers = {"content-type":"application/json","cache-control":"no-store","x-request-id":requestId};
  try { return new Response(JSON.stringify({data:await operation(),requestId}),{status:200,headers}); }
  catch(error) {
    const known = error instanceof ApiError ? error : error instanceof DatabaseError && error.code === "CONFLICT" ? new ApiError(409,"CONFLICT","The record changed or conflicts with an existing record.") : null;
    return new Response(JSON.stringify({error:{code:known?.code ?? "UNAVAILABLE",message:known?.message ?? "Service unavailable.",requestId}}),{status:known?.status ?? 503,headers:{...headers,...(known?.status===429&&known.retryAfterSeconds ? {"retry-after":String(known.retryAfterSeconds)} : {})}});
  }
}
